# SalonKu Customer Booking Flow

Dokumen ini menjelaskan rancangan alur booking customer yang efektif, efisien, dan aman dari tabrakan slot antar user. Fokus utama dokumen ini adalah flow reservasi salon/wellness seperti marketplace booking modern: customer memilih layanan, professional, tanggal, jam, masuk review, mengunci slot sementara, lalu melakukan konfirmasi atau pembayaran.

## Tujuan

Alur booking harus memenuhi tujuan berikut:

1. Customer bisa booking dengan cepat tanpa chat manual.
2. Slot yang terlihat tersedia harus mendekati kondisi real-time.
3. Sistem harus mencegah double booking antar customer.
4. Slot tidak boleh dikunci terlalu dini saat customer masih eksplor.
5. Slot harus dikunci sementara saat customer sudah masuk tahap review/checkout.
6. Payment pending harus tetap memblokir slot sampai paid atau expired.
7. Booking harus atomic di backend, bukan bergantung pada state frontend.
8. Draft booking customer tidak hilang saat refresh pada perangkat yang sama.

## Prinsip Utama

### 1. Availability bukan hold

Availability hanya untuk menampilkan slot yang tersedia.

Availability tidak boleh membuat booking, payment, atau hold.

Contoh availability:

```txt
Customer pilih service + staff + tanggal
Frontend request slot kosong
Backend balas daftar jam tersedia
Tidak ada row booking baru
```

### 2. Hold dibuat hanya saat customer hampir checkout

Hold sebaiknya dibuat saat customer klik `Continue` dari tahap pilih waktu ke tahap review/summary.

Jangan hold saat customer baru klik jam. User sering mencoba beberapa jam sebelum yakin. Kalau setiap klik jam langsung membuat hold, slot akan terlihat penuh palsu dan backend menjadi ramai.

### 3. Backend adalah sumber kebenaran

Frontend timer, disabled button, refresh slot, dan alert hanya membantu UX.

Keputusan final slot tersedia atau tidak harus selalu dilakukan di backend dengan:

- database transaction
- row lock
- cek overlap ulang
- status booking aktif yang jelas
- expiry hold server-side

### 4. Semua create/finalize booking harus cek ulang slot

Walaupun frontend baru saja menerima availability, backend tetap wajib cek ulang saat:

- membuat hold
- finalize hold
- membuat payment
- reschedule booking

Ini penting karena dua customer bisa melihat slot yang sama sebelum salah satunya mengunci.

## Istilah

### Draft booking

Data pilihan customer yang belum memblokir slot.

Contoh isi draft:

```json
{
  "branch_id": 1,
  "service_ids": [10, 12],
  "staff_id": 5,
  "booking_date": "2026-07-15",
  "start_time": "13:30",
  "notes": "Tolong jangan pakai parfum terlalu kuat"
}
```

Draft boleh disimpan di:

- session storage
- local storage sementara

Draft tidak boleh dianggap booking.

Backend tidak menyimpan draft ke `customer_activities`. Tabel tersebut khusus menjadi indeks booking yang sudah berhasil difinalisasi.

### Availability

Hasil perhitungan slot yang bisa dipilih customer.

Availability dihitung dari:

- branch working days
- branch working hours
- staff schedule
- staff skill
- service duration
- booking aktif
- hold aktif
- payment pending

### Hold

Booking sementara yang memblokir slot untuk waktu pendek.

Contoh:

```txt
status = pending_hold
hold_expires_at = now + 3 minutes
```

Di code saat ini, hold memakai `status = pending` dan `hold_expires_at != null`. Itu masih bisa berjalan, tetapi untuk jangka panjang lebih rapi kalau status dibuat eksplisit: `pending_hold`.

### Finalize

Proses mengubah hold menjadi booking sungguhan.

Jika bayar di tempat:

```txt
pending_hold -> confirmed
payment.status = unpaid
```

Jika bayar online:

```txt
pending_hold -> pending_payment
payment.status = pending
payment.expiry_time = now + 10/15 minutes
```

## State Booking Yang Disarankan

State ideal:

```txt
draft
  -> pending_hold
      -> confirmed
      -> pending_payment
          -> confirmed
          -> payment_expired
      -> expired_hold
      -> customer_cancelled
  -> cancelled
  -> completed
  -> no_show
```

Untuk implementasi Go saat ini, mapping bisa seperti ini:

| Konsep | Status Saat Ini | Status Ideal |
| --- | --- | --- |
| Slot dikunci sementara | `pending` + `hold_expires_at` | `pending_hold` |
| Menunggu pembayaran | `pending_payment` | `pending_payment` |
| Terkonfirmasi | `confirmed` | `confirmed` |
| Customer membatalkan | `cancelled` atau `customer_cancelled` | `customer_cancelled` |
| Provider membatalkan | `provider_cancelled` | `provider_cancelled` |
| Selesai | `completed` | `completed` |
| Hold expired | deleted atau cancelled | `expired_hold` |
| Payment expired | status payment failed/expired | `payment_expired` |

Rekomendasi: gunakan status eksplisit agar laporan, audit, dan debugging lebih mudah.

## Status Yang Memblokir Slot

Slot harus dianggap tidak tersedia jika ada booking overlap dengan status berikut:

```txt
pending_hold
pending
pending_payment
confirmed
waiting
checked_in
in_progress
inprogress
rescheduled
```

Catatan:

- `pending` dimasukkan karena code saat ini memakai `pending` untuk hold.
- `pending_payment` harus memblokir slot karena customer sudah masuk payment.
- `waiting`, `checked_in`, dan `in_progress` memblokir slot karena appointment sedang berjalan.

Status yang tidak memblokir slot:

```txt
expired_hold
payment_expired
cancelled
customer_cancelled
provider_cancelled
completed
no_show
refund_completed
```

## Formula Overlap Slot

Jangan cek bentrok hanya dari start time yang sama.

Booking service bisa berdurasi 30, 60, 90, atau 150 menit. Maka cek overlap harus memakai interval.

Formula:

```txt
requested_start < existing_end
AND requested_end > existing_start
```

Contoh:

```txt
Booking A: 13:00 - 14:30
Booking B: 14:00 - 15:00

13:00 < 15:00 = true
14:30 > 14:00 = true

Bentrok.
```

Contoh tidak bentrok:

```txt
Booking A: 13:00 - 14:00
Booking B: 14:00 - 15:00

13:00 < 15:00 = true
14:00 > 14:00 = false

Tidak bentrok.
```

## Alur Booking Customer

### Step 1: Customer membuka salon detail

Customer membuka halaman salon.

Frontend memuat:

- branch detail
- service list
- staff list
- rating/review
- harga minimum
- working hours

Belum ada booking atau hold.

### Step 2: Customer memilih service

Customer memilih satu atau beberapa service.

Frontend menghitung sementara:

- subtotal
- durasi total
- service category
- service add-on jika ada

Backend bisa dipanggil untuk preview staff eligible:

```txt
POST /api/customer/booking/check-availability
```

Payload:

```json
{
  "branch_id": 1,
  "service_ids": [10, 12],
  "booking_type": "scheduled",
  "booking_date": null,
  "staff_id": null
}
```

Response:

```json
{
  "data": {
    "eligible_staff": [
      {
        "id": 5,
        "name": "Sari",
        "skills": [
          { "id": 10, "title": "Haircut" },
          { "id": 12, "title": "Hair Spa" }
        ]
      }
    ],
    "available_slots": [],
    "estimated_duration": 90,
    "total_price": 250000
  }
}
```

Karena belum ada tanggal, `available_slots` boleh kosong.

### Step 3: Customer memilih professional

Opsi:

1. Pilih professional tertentu.
2. Pilih `Siapa Saja`.

Jika customer memilih professional tertentu, backend hanya mencari slot untuk staff itu.

Jika customer memilih `Siapa Saja`, backend mencari semua staff eligible. Saat hold dibuat, backend harus memilih staff final dan menyimpannya ke booking.

Rekomendasi pemilihan staff untuk `Siapa Saja`:

1. Staff punya semua skill service.
2. Staff sedang aktif.
3. Staff bekerja di branch tersebut.
4. Staff bekerja pada tanggal itu.
5. Staff tidak punya booking overlap.
6. Pilih staff dengan workload paling ringan pada hari tersebut.

### Step 4: Customer memilih tanggal

Frontend memanggil availability:

```json
{
  "branch_id": 1,
  "service_ids": [10, 12],
  "booking_type": "scheduled",
  "booking_date": "2026-07-15",
  "staff_id": 5
}
```

Backend:

1. Validasi branch aktif.
2. Validasi provider aktif dan dokumen verified.
3. Validasi service aktif.
4. Validasi service tersedia di branch.
5. Hitung durasi total.
6. Ambil staff eligible.
7. Generate slot berdasarkan working hours.
8. Hapus slot yang sudah lewat.
9. Hapus slot yang bentrok booking aktif.
10. Hapus slot yang bentrok hold aktif.

Response:

```json
{
  "data": {
    "available_slots": [
      {
        "time": "13:00",
        "staff_id": 5,
        "staff_name": "Sari",
        "estimated_end_time": "14:30"
      },
      {
        "time": "14:30",
        "staff_id": 5,
        "staff_name": "Sari",
        "estimated_end_time": "16:00"
      }
    ]
  }
}
```

### Step 5: Customer memilih jam

Saat customer klik jam, frontend hanya menyimpan pilihan.

Jangan buat hold di step ini.

Alasannya:

- Customer masih mungkin mengganti jam.
- Customer mungkin kembali pilih staff lain.
- Customer mungkin menutup tab.
- Slot akan cepat penuh palsu kalau semua klik jam menjadi hold.

Yang dilakukan frontend:

```txt
selected_date = 2026-07-15
selected_time = 13:00
selected_staff = 5
```

Simpan ke draft agar tidak hilang saat refresh/login.

### Step 6: Customer klik Continue ke review

Ini adalah momen pertama membuat hold.

Frontend harus memanggil backend untuk cek ulang slot dan membuat hold.

Endpoint:

```txt
POST /api/customer/bookings
```

Payload:

```json
{
  "branch_id": 1,
  "service_ids": [10, 12],
  "booking_type": "scheduled",
  "staff_id": 5,
  "booking_date": "2026-07-15",
  "start_time": "13:00",
  "payment_type": "pay_at_salon",
  "payment_channel": null,
  "hold_only": true
}
```

Backend membuat hold:

```txt
status = pending_hold
hold_expires_at = now + 3 minutes
payment.status = unpaid or placeholder
```

Untuk code saat ini:

```txt
status = pending
hold_expires_at = now + 3 minutes
```

### Step 7: Customer melihat review/summary

Halaman review menampilkan:

- salon
- service
- staff final
- tanggal
- jam mulai
- estimasi selesai
- total durasi
- harga
- voucher/coupon
- payment method
- notes
- cancellation policy
- countdown hold

Timer hold:

```txt
03:00
02:59
02:58
...
00:00
```

Jika timer habis:

1. Frontend menghapus draft hold.
2. Frontend kembali ke step pilih jam atau salon detail.
3. Backend tetap yang menentukan apakah hold expired.

Catatan penting: frontend timer tidak boleh menjadi sumber kebenaran.

### Step 8: Customer konfirmasi

Jika bayar di tempat:

```txt
POST /api/customer/bookings/{booking}/finalize
```

Payload:

```json
{
  "payment_type": "pay_at_salon",
  "payment_channel": null,
  "coupon_code": null,
  "notes": "Tolong jangan pakai parfum terlalu kuat"
}
```

Backend:

1. Lock booking hold.
2. Pastikan booking milik customer.
3. Pastikan hold masih aktif.
4. Cek ulang konflik slot.
5. Hitung ulang harga dari database.
6. Apply coupon jika ada.
7. Update payment.
8. Ubah booking menjadi confirmed.

Result:

```txt
booking.status = confirmed
payment.payment_type = pay_at_salon
payment.status = unpaid
```

Jika bayar online:

```json
{
  "payment_type": "full_payment",
  "payment_channel": "qris",
  "coupon_code": "NEWUSER",
  "notes": "Tolong jangan pakai parfum terlalu kuat"
}
```

Result:

```txt
booking.status = pending_payment
payment.status = pending
payment.expiry_time = now + 10/15 minutes
```

### Step 9: Payment online

Jika payment berhasil:

```txt
payment.status = paid
booking.payment_status = paid
booking.status = confirmed
```

Jika payment expired:

```txt
payment.status = expired or failed
booking.payment_status = expired or failed
booking.status = payment_expired or cancelled
slot released
```

Selama payment pending, slot tetap harus memblokir customer lain.

## Logika Backend Detail

### Check availability

Pseudo flow:

```txt
function checkAvailability(payload):
    validate payload
    releaseExpiredHolds()

    branch = find active branch
    ensure provider active and verified

    services = validate services
    duration = sum service duration

    eligibleStaff = find staff with:
        branch_id = branch.id
        status = active
        current_status != offline
        has all selected service skills
        working on selected date

    slots = []

    for staff in eligibleStaff:
        windows = working windows for staff and branch

        for each 30-minute cursor inside windows:
            start = cursor
            end = cursor + duration

            if start <= now:
                skip

            if overlaps active bookings:
                skip

            if overlaps active holds:
                skip

            slots.add(start, end, staff)

    return slots sorted by time
```

### Create hold

Pseudo flow:

```txt
function createHold(payload, customer):
    releaseExpiredHolds(customer.id)

    validate branch
    validate services
    validate date/time

    begin transaction

    if selected staff:
        lock staff row
        staff = selected staff
    else:
        staff = choose best available staff
        lock staff row

    activeBookings = lock bookings for staff/date active statuses
    activeBranchHolds = lock branch holds for date

    if requested slot overlaps activeBookings:
        rollback
        return error "Slot baru saja dibooking customer lain"

    if requested slot overlaps activeBranchHolds:
        rollback
        return error "Slot baru saja dikunci customer lain"

    cancel previous active hold from same customer and branch

    create booking:
        status = pending_hold
        hold_expires_at = now + 3 minutes
        customer_id = customer.id
        branch_id = branch.id
        staff_id = staff.id
        booking_date = date
        start_time = time
        estimated_end_time = time + duration
        total_duration = duration
        total_price = calculated price

    attach booking services snapshot
    create payment placeholder if needed

    commit
    return booking
```

### Finalize hold

Pseudo flow:

```txt
function finalizeHold(booking, payload, customer):
    releaseExpiredHolds(customer.id)

    begin transaction

    lockedBooking = lock booking by id

    if lockedBooking.customer_id != customer.id:
        rollback
        return forbidden

    if lockedBooking.status != pending_hold:
        rollback
        return error

    if lockedBooking.hold_expires_at <= now:
        rollback
        mark expired
        return error "Waktu booking sudah habis"

    lock staff row

    activeBookings = lock bookings for staff/date active statuses except lockedBooking
    activeBranchHolds = lock branch holds for date except lockedBooking

    if requested slot overlaps activeBookings or activeBranchHolds:
        rollback
        return error "Slot baru saja dibooking customer lain"

    recalculate price from DB
    apply coupon
    update payment

    if payment type pay_at_salon:
        status = confirmed
        payment_status = unpaid
    else:
        status = pending_payment
        payment_status = pending
        payment_expiry = now + 15 minutes

    hold_expires_at = null

    commit
    return booking
```

### Release expired hold

Pseudo flow:

```txt
function releaseExpiredHolds(customerId = null):
    holds = bookings where:
        status = pending_hold
        hold_expires_at <= now
        customer_id = customerId if provided

    for each hold:
        begin transaction
        lock hold
        if still expired:
            status = expired_hold
            expired_at = now
            payment.status = expired/failed
        commit
```

Catatan: code saat ini menghapus hold. Itu sederhana, tetapi untuk audit lebih baik update status menjadi `expired_hold`.

## Anti Double Booking

Anti double booking tidak cukup dengan frontend refresh.

Yang wajib:

1. Transaction.
2. Lock row staff atau row booking terkait.
3. Query ulang active booking di dalam transaction.
4. Query ulang active hold di dalam transaction.
5. Cek overlap dengan durasi.
6. Exclude booking hold sendiri saat finalize.
7. Payment pending tetap dianggap active.

Skenario:

```txt
User A dan User B melihat slot 13:00 kosong.

User A klik Continue.
Backend lock staff.
Backend cek kosong.
Backend buat hold 13:00.
Commit.

User B klik Continue.
Backend lock staff.
Backend cek ulang.
Backend menemukan hold User A.
Backend menolak User B.
```

Hasil:

```txt
Hanya User A yang mendapat hold.
User B harus pilih jam lain.
```

## Idempotency

Endpoint hold dan finalize sebaiknya mendukung idempotency key.

Tujuan:

- mencegah double click membuat dua hold
- retry network tidak membuat booking ganda
- request finalize tidak membuat payment ganda

Header atau payload:

```txt
Idempotency-Key: customer-1-branch-2-20260715-1300-staff-5-abc123
```

Tabel opsional:

```txt
idempotency_keys
- id
- key
- user_id
- endpoint
- request_hash
- response_status
- response_body
- created_at
- expires_at
```

Behavior:

```txt
Jika key baru:
    proses request
    simpan response

Jika key sama dan request_hash sama:
    return response lama

Jika key sama tapi request_hash beda:
    return 409 conflict
```

## Payment Handling

### Pay at venue

Flow:

```txt
pending_hold -> confirmed
payment.status = unpaid
```

Slot tetap diblokir sampai booking selesai, cancel, atau no-show.

### Full payment / DP

Flow:

```txt
pending_hold -> pending_payment
payment.status = pending
payment.expiry_time = now + 15 minutes
```

Jika paid:

```txt
pending_payment -> confirmed
payment.status = paid
```

Jika expired:

```txt
pending_payment -> payment_expired
payment.status = expired
slot released
```

Payment pending harus memblokir slot karena customer sudah berada di proses bayar.

## Coupon Handling

Coupon sebaiknya tidak benar-benar digunakan saat hold.

Saat hold:

```txt
calculate preview only
do not increment used_count
```

Saat finalize:

```txt
validate coupon
calculate final price
increment used_count
```

Jika finalize gagal, coupon tidak boleh terpakai.

Jika payment expired setelah coupon sudah dipakai, sistem harus menentukan policy:

1. Used count tetap naik karena attempt booking terjadi.
2. Used count dikembalikan saat payment expired.

Rekomendasi untuk SalonKu:

- Untuk coupon terbatas, kembalikan used count saat payment expired/cancelled sebelum paid.
- Untuk coupon audit, simpan `coupon_redemptions` agar lebih jelas.

## Frontend Flow Detail

### State frontend

State utama:

```txt
selectedServices
selectedAddons
selectedStaff
selectedDate
selectedTime
eligibleStaff
availableSlots
draftBooking
heldBooking
holdSecondsLeft
bookingExpiresAt
paymentMethod
notes
coupon
```

### Kapan request availability

Request availability dilakukan saat:

1. Service berubah.
2. Staff berubah.
3. Tanggal berubah.
4. Page focus kembali.
5. Tab kembali visible.
6. User klik Continue dari pilih waktu ke review.
7. Optional interval 10-30 detik saat step pilih waktu.

Jangan request availability setiap 1 detik.

Rekomendasi:

```txt
AVAILABILITY_REFRESH_MS = 15000
```

### Kapan create hold

Create hold dilakukan hanya saat:

```txt
current_step = pilih waktu
customer klik Continue
selectedDate ada
selectedTime ada
selectedService ada
customer sudah login
```

Jika customer belum login:

```txt
save draft
redirect ke login
set next=/booking/{salonSlug}
setelah login kembali ke booking
baru create hold saat Continue lagi
```

### Kapan release hold

Frontend boleh memanggil cancel hold saat:

- customer kembali edit service
- customer kembali edit staff
- customer ganti tanggal
- customer ganti jam
- customer keluar flow dan pilih discard
- hold timer habis

Tetapi backend tetap harus release expired hold sendiri.

### Button state

Tombol Continue:

```txt
Step service:
    enabled jika selectedServices.length > 0

Step staff:
    enabled jika selectedStaff ada

Step time:
    enabled jika selectedDate dan selectedTime ada
    disabled jika loading availability
    disabled jika creating hold

Step review:
    enabled jika agreedToTerms
    enabled jika heldBooking aktif
    disabled jika submitting
```

Label:

```txt
Step 1-2: Continue
Step 3 loading: Mengunci jadwal...
Step 4 pay at venue: Konfirmasi Reservasi
Step 4 online payment: Bayar Sekarang
```

## Backend Data Model Recommendation

### bookings

Kolom penting:

```txt
id
booking_code
customer_id
provider_id
branch_id
staff_id
booking_type
booking_date
start_time
estimated_end_time
total_duration
amount
total_price
status
payment_status
hold_expires_at
held_at
expired_at
cancelled_at
completed_at
notes
idempotency_key
created_at
updated_at
```

### booking_services

Simpan snapshot agar histori tidak berubah saat service berubah.

```txt
booking_id
service_id
service_name_snapshot
price
estimated_duration
```

Saat ini pivot sudah menyimpan price dan estimated_duration. Rekomendasi tambahan: simpan nama service snapshot.

### payments

Kolom penting:

```txt
id
booking_id
payment_type
amount
status
payment_method
payment_channel
expiry_time
paid_at
expired_at
midtrans_order_id
raw_response
created_at
updated_at
```

## Index Database Yang Disarankan

Untuk availability dan conflict check cepat:

```txt
bookings(branch_id, booking_date, status)
bookings(staff_id, booking_date, status)
bookings(customer_id, status, hold_expires_at)
bookings(status, hold_expires_at)
bookings(booking_code)
payments(booking_id)
payments(status, expiry_time)
provider_staffs(branch_id, status, current_status)
staff_schedules(provider_staff_id, day_of_week, is_available)
```

Jika memakai PostgreSQL, index gabungan yang paling penting:

```sql
CREATE INDEX bookings_staff_date_status_idx
ON bookings (staff_id, booking_date, status);

CREATE INDEX bookings_branch_date_status_idx
ON bookings (branch_id, booking_date, status);

CREATE INDEX bookings_hold_expiry_idx
ON bookings (status, hold_expires_at);
```

## API Contract Yang Disarankan

### Check availability

```txt
POST /api/customer/booking/check-availability
```

Request:

```json
{
  "branch_id": 1,
  "service_ids": [10, 12],
  "booking_type": "scheduled",
  "booking_date": "2026-07-15",
  "staff_id": null,
  "held_booking_id": null
}
```

Response:

```json
{
  "data": {
    "server_now": "2026-07-10T09:00:00+07:00",
    "timezone": "Asia/Bangkok",
    "eligible_staff": [],
    "available_slots": [
      {
        "time": "13:00",
        "staff_id": 5,
        "staff_name": "Sari",
        "estimated_end_time": "14:30"
      }
    ],
    "estimated_duration": 90,
    "total_price": 250000
  }
}
```

### Create hold

```txt
POST /api/customer/bookings
```

Request:

```json
{
  "branch_id": 1,
  "service_ids": [10, 12],
  "booking_type": "scheduled",
  "staff_id": 5,
  "booking_date": "2026-07-15",
  "start_time": "13:00",
  "payment_type": "pay_at_salon",
  "payment_channel": null,
  "hold_only": true,
  "idempotency_key": "customer-1-branch-1-20260715-1300-staff-5-abc123"
}
```

Response:

```json
{
  "message": "Jadwal berhasil dikunci sementara selama 3 menit.",
  "data": {
    "id": 100,
    "booking_code": "BK-260710-ABC123",
    "status": "pending_hold",
    "booking_date": "2026-07-15",
    "start_time": "13:00",
    "estimated_end_time": "14:30",
    "hold_expires_at": "2026-07-10T09:03:00+07:00"
  }
}
```

### Finalize booking

```txt
POST /api/customer/bookings/{booking}/finalize
```

Request:

```json
{
  "payment_type": "full_payment",
  "payment_channel": "qris",
  "coupon_code": "NEWUSER",
  "notes": "Tolong jangan pakai parfum terlalu kuat",
  "idempotency_key": "finalize-booking-100-abc123"
}
```

Response:

```json
{
  "message": "Booking berhasil dikonfirmasi.",
  "data": {
    "id": 100,
    "booking_code": "BK-260710-ABC123",
    "status": "pending_payment",
    "payment_status": "pending",
    "payment": {
      "status": "pending",
      "payment_channel": "qris",
      "expiry_time": "2026-07-10T09:15:00+07:00"
    }
  }
}
```

## Error Handling

### Slot baru saja diambil user lain

HTTP:

```txt
422 Unprocessable Entity
```

Message:

```txt
Slot ini baru saja dibooking customer lain. Pilih jam lain.
```

Frontend action:

1. Clear selected time.
2. Refresh availability.
3. Tetap di step pilih waktu.

### Hold expired

HTTP:

```txt
422 Unprocessable Entity
```

Message:

```txt
Waktu booking sudah habis. Silakan pilih jadwal lagi.
```

Frontend action:

1. Clear held booking.
2. Clear selected time.
3. Kembali ke step pilih waktu.
4. Refresh availability.

### Staff tidak eligible

Message:

```txt
Professional ini tidak tersedia untuk service dan tanggal yang dipilih.
```

Frontend action:

1. Clear selected staff atau selected time.
2. Arahkan customer pilih staff/jam lain.

### Payment expired

Message:

```txt
Pembayaran sudah kedaluwarsa. Silakan buat booking ulang.
```

Frontend action:

1. Redirect ke booking detail dengan status expired, atau
2. Redirect ke salon detail untuk pilih slot ulang.

## Background Jobs / Scheduler

Sebaiknya ada scheduler untuk:

### Release expired holds

Interval:

```txt
every minute
```

Action:

```txt
booking status pending_hold / pending
hold_expires_at <= now
=> expired_hold or delete hold
```

### Expire pending payments

Interval:

```txt
every minute
```

Action:

```txt
payment.status = pending
expiry_time <= now
=> payment expired
=> booking payment_expired/cancelled
=> slot released
```

## QA Test Scenarios

### 1. Two users pick same slot

Steps:

1. User A and User B open same salon.
2. Both select same service, same staff, same date, same time.
3. User A clicks Continue.
4. User B clicks Continue immediately after.

Expected:

```txt
User A gets hold.
User B gets error.
Only one active hold exists.
```

### 2. Hold expires

Steps:

1. User creates hold.
2. Wait more than hold duration.
3. User tries finalize.

Expected:

```txt
Finalize rejected.
Slot becomes available again.
Booking marked expired_hold or deleted.
```

### 3. Same user changes time

Steps:

1. User creates hold for 13:00.
2. User goes back and chooses 14:00.

Expected:

```txt
13:00 hold is released.
14:00 hold is created.
Only one active hold for same customer/branch.
```

### 4. Any staff selection

Steps:

1. User selects `Siapa Saja`.
2. User selects slot.
3. User enters review.

Expected:

```txt
Backend assigns one concrete staff.
Booking hold stores staff_id.
Finalize keeps same staff_id.
```

### 5. Payment pending blocks slot

Steps:

1. User A finalizes with QRIS.
2. Booking becomes pending_payment.
3. User B checks same slot.

Expected:

```txt
Slot is unavailable for User B.
```

### 6. Payment expired releases slot

Steps:

1. User A finalizes with QRIS.
2. Payment expires.
3. User B checks same slot.

Expected:

```txt
Slot becomes available again.
```

### 7. Double click confirm

Steps:

1. User is on review page.
2. User double-clicks confirm button quickly.

Expected:

```txt
Only one booking finalize action happens.
Only one payment record is active.
Response is idempotent or second click is ignored.
```

### 8. Refresh page during review

Steps:

1. User creates hold and enters review.
2. User refreshes page.

Expected:

```txt
Draft and hold restored if hold is still active.
Timer continues from server hold_expires_at.
```

## Performance Notes

### Avoid polling too often

Do not call availability every second.

Recommended:

```txt
On change: immediate request
On focus: immediate request
On visibility visible: immediate request
Interval while selecting time: 15 seconds
Before continue: mandatory final refresh
```

### Cache carefully

Availability should not be cached long.

Headers:

```txt
Cache-Control: no-store, no-cache, must-revalidate, max-age=0
Pragma: no-cache
```

### Minimize slot generation cost

For each request:

1. Fetch bookings for selected branch/date once.
2. Group by staff_id.
3. Fetch active holds for branch/date once.
4. Generate slots in memory.

Avoid querying booking per slot.

## Implementation Plan For SalonKu

### Phase 1: Current logic stabilization

1. Keep hold only when entering review.
2. Keep final availability check before hold.
3. Keep backend transaction conflict check.
4. Keep active hold included in availability conflict.
5. Keep payment pending as active status.
6. Reduce availability polling to 15 seconds.

### Phase 2: Status cleanup

1. Add `pending_hold`.
2. Add `expired_hold`.
3. Add `payment_expired`.
4. Stop deleting expired hold.
5. Add `expired_at`.
6. Update dashboards and activity display labels.

### Phase 3: Idempotency

1. Add `idempotency_key` to booking hold request.
2. Add idempotency persistence.
3. Add idempotency to finalize request.
4. Add tests for double click/retry.

### Phase 4: Payment expiry

1. Add payment expiry scheduler.
2. Ensure pending payment blocks slot.
3. Release slot when payment expired.
4. Add tests for payment pending and payment expiry.

### Phase 5: Audit and reporting

1. Store service name snapshot.
2. Store coupon redemption rows.
3. Store hold expired analytics.
4. Store booking timeline events.

## Acceptance Criteria

Booking flow is considered safe when:

1. Two customers cannot confirm the same staff/time slot.
2. A customer cannot finalize an expired hold.
3. Payment pending blocks the slot.
4. Payment expiry releases the slot.
5. Staff `Siapa Saja` is resolved before hold is created.
6. Service duration is included in conflict checking.
7. All conflict checks run in backend transaction.
8. Frontend can refresh/retry without creating duplicate booking.
9. Customer can login without losing draft.
10. Availability does not overload backend with aggressive polling.

## Summary

The most efficient booking pattern is:

```txt
Browse slots without hold.
Hold only at review/checkout.
Finalize hold atomically.
Keep payment pending as slot blocker.
Release expired holds/payments server-side.
Use idempotency for retries.
```

This pattern keeps UX fast, reduces fake-full slots, prevents double booking, and gives the backend a clear source of truth.
