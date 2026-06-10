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

export async function createTransaction(data) {
  return query(
    `INSERT INTO transactions 
      (doctor_id, patient_id, start_time, end_time, duration_min, mbs_level, setting, gross_amount, doctor_share, clinic_share, status, payment_status, is_after_hours)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'COMPLETED','UNPAID',$11)
     RETURNING id`,
    [
      data.doctorId, data.patientId, data.startTime, data.endTime,
      data.durationMin, data.mbsLevel, data.setting, data.grossAmount,
      data.doctorShare, data.clinicShare, data.isAfterHours
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