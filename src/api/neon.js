async function query(sql, params = []) {
  const response = await fetch('/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql, params }),
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('Query error:', JSON.stringify(error));
    throw new Error(`Query failed: ${JSON.stringify(error)}`);
  }

  const data = await response.json();
  return data.rows;
}

// ─── ConsultTimer ─────────────────────────────────────────────────────────────

export async function getDoctors() {
  return query('SELECT id, full_name, service_fee_percentage, email FROM doctors WHERE is_active = true ORDER BY full_name');
}

export async function searchPatients(term) {
  return query(
    `SELECT id, first_name, last_name, dob FROM patients 
     WHERE first_name ILIKE $1 OR last_name ILIKE $1 
     ORDER BY last_name, first_name LIMIT 10`,
    [`%${term}%`]
  );
}

export async function getMbsLevels() {
  return query('SELECT level_code, description, min_minutes, normal_fee, after_hours_fee FROM mbs_levels ORDER BY min_minutes');
}

/**
 * Insert a completed transaction AND its corresponding doctor_service_fees row
 * in a single atomic statement, so the service fee ledger can never drift
 * out of sync with the transactions table.
 */
export async function createTransaction(data) {
  return query(
    `WITH new_txn AS (
       INSERT INTO transactions 
         (doctor_id, patient_id, start_time, end_time, duration_min, mbs_level, setting, gross_amount, doctor_share, clinic_share, status, payment_status, is_after_hours)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'COMPLETED','UNPAID',$11)
       RETURNING id
     ),
     fee_insert AS (
       INSERT INTO doctor_service_fees (transaction_id, doctor_id, amount, doctor_net_share)
       SELECT id, $12, $10, $9 FROM new_txn
       RETURNING id
     )
     SELECT id FROM new_txn`,
    [
      data.doctorId, data.patientId, data.startTime, data.endTime,
      data.durationMin, data.mbsLevel, data.setting, data.grossAmount,
      data.doctorShare, data.clinicShare, data.isAfterHours, data.doctorId
    ]
  );
}

export async function getUnpaidTransactions() {
  return query(
    `SELECT t.id, t.start_time, t.duration_min, t.mbs_level, t.setting, t.gross_amount, t.is_after_hours,
            d.full_name as doctor_name, 
            p.first_name || ' ' || p.last_name as patient_name
     FROM transactions t
     JOIN doctors d ON t.doctor_id = d.id
     LEFT JOIN patients p ON t.patient_id = p.id
     WHERE t.payment_status = 'UNPAID'
     ORDER BY t.start_time DESC`
  );
}

export async function markTransactionPaid(id, billingType, chargedAmount, mbsRebate, gapAmount) {
  return query(
    `UPDATE transactions 
     SET payment_status = 'PAID', billing_type = $2, charged_amount = $3, mbs_rebate = $4, gap_amount = $5
     WHERE id = $1`,
    [id, billingType, chargedAmount, mbsRebate, gapAmount]
  );
}

export async function getInvoices() {
  return query(
    `SELECT i.*, d.full_name as doctor_name 
     FROM invoices i
     JOIN doctors d ON i.doctor_id = d.id
     ORDER BY i.generated_at DESC`
  );
}

export async function createInvoice(data) {
  return query(
    `INSERT INTO invoices 
      (invoice_uid, doctor_id, period_start, period_end, consult_count, total_gross, service_fee, gst_amount, total_owing, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING')
     RETURNING id`,
    [
      data.invoiceUid, data.doctorId, data.periodStart, data.periodEnd,
      data.consultCount, data.totalGross, data.serviceFee, data.gstAmount, data.totalOwing
    ]
  );
}

// ─── Front Desk Billing ───────────────────────────────────────────────────────

/**
 * Search unpaid consults by patient name for the billing search panel.
 * Maps to GAS: ConsultRepository.getUnpaid(searchTerm)
 * SQL: get_unpaid_consults($1)
 */
export async function searchConsults(term) {
  const rows = await query('SELECT * FROM get_unpaid_consults($1)', [term]);
  return rows || [];
}

/**
 * Fetch a single consult by transaction ID for the preload flow.
 * Maps to GAS: ConsultRepository.getConsultByTransactionId(transactionId)
 * SQL: get_consult_by_id($1)
 */
export async function getConsultByTransactionId(transactionId) {
  const rows = await query('SELECT * FROM get_consult_by_id($1)', [transactionId]);
  return rows[0] || null;
}

/**
 * Resolve the private fee for a given doctor, MBS level, and after-hours flag.
 * Maps to GAS: DoctorRepository.resolvePrivateFee(doctorId, mbsLevel, isAfterHours)
 * SQL: resolve_private_fee($1, $2, $3)
 * Note: GAS passes (doctorId, !!isAfterHours, mbsLevel) — order preserved here.
 */
export async function getPrivateFee(doctorId, mbsLevel, isAfterHours) {
  const rows = await query(
    'SELECT * FROM resolve_private_fee($1, $2, $3)',
    [doctorId, !!isAfterHours, mbsLevel]
  );
  const raw = rows[0]?.resolve_private_fee;
  if (raw == null) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

/**
 * Mark a consult as paid — bulk bill or private.
 * Maps to GAS: ConsultRepository.markBulkBill(id) or markPrivatePaid(id, amount)
 * Returns { patientName, amount } as expected by FrontDeskBilling.
 */
export async function processFinalPayment(transactionId, mode, total, gap) {
  if (mode === 'BULK') {
    const rows = await query('SELECT * FROM mark_bulk_bill($1)', [transactionId]);
    const row = rows[0] || {};
    return {
      patientName: row.patient_name || '',
      amount: 0,
    };
  }

  // PRIVATE
  const rows = await query(
    'SELECT * FROM mark_private_paid($1, $2)',
    [transactionId, total]
  );
  const row = rows[0] || {};
  return {
    patientName: row.patient_name || '',
    amount: total,
  };
}

export async function getRecentUnpaidConsults() {
  const rows = await query('SELECT * FROM get_recent_unpaid_consults()');
  return rows || [];
}

// ─── Service Fee ──────────────────────────────────────────────────────────────

/**
 * Get the outstanding service fee summary for each doctor with a balance owing
 * or pending (unpaid) consults.
 * Maps to /service screen.
 * SQL: get_service_fee_summary()
 * Returns rows: { doctor_id, doctor_name, consult_count, service_fee, gst_amount, total_owing, unpaid_consult_count }
 */
export async function getServiceFeeSummary() {
  const rows = await query('SELECT * FROM get_service_fee_summary()');
  return rows || [];
}

/**
 * Mark all outstanding (PAID-consult) service fees for a doctor as paid.
 * Maps to the PAID button on /service.
 * SQL: mark_service_fee_paid($1)
 * Returns { status, doctorId, consultsPaid, amountSettled } or { error }.
 */
export async function markServiceFeePaid(doctorId) {
  const rows = await query('SELECT * FROM mark_service_fee_paid($1)', [doctorId]);
  const raw = rows[0]?.mark_service_fee_paid;
  if (raw == null) return null;

  const result = typeof raw === 'string' ? JSON.parse(raw) : raw;

  if (result.error) {
    return { error: result.error };
  }

  return {
    status: result.status,
    doctorId: result.doctor_id,
    consultsPaid: result.consults_paid,
    amountSettled: result.amount_settled,
  };
}

/**
 * Get all consults for a doctor where the patient/Medicare has not yet paid.
 * Maps to /unpaid screen.
 * SQL: get_unpaid_consults_by_doctor($1)
 * Returns rows: { transaction_id, patient_name, start_time, mbs_level, setting, gross_amount, clinic_share }
 */
export async function getUnpaidConsultsByDoctor(doctorId) {
  const rows = await query('SELECT * FROM get_unpaid_consults_by_doctor($1)', [doctorId]);
  return rows || [];
}