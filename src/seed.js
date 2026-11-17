'use strict';
/* Demo data taken from the original prototype's 12 sample dorms.
   Runs automatically on first start when the database is empty (unless SEED_DEMO_DATA=false).
   `npm run reset-db` wipes the database file and reseeds. */
const fs = require('fs');
const { db, tx } = require('./db');
const { hashPassword } = require('./auth');

const DEMO_OWNERS = [
  { name: 'Maple Residence Admin', email: 'owner@dormmetric.test', password: 'Owner123!' },
  { name: 'Campus Corner Management', email: 'owner2@dormmetric.test', password: 'Owner123!' }
];
const DEMO_STUDENT = { name: 'Juan Dela Cruz', email: 'student@dormmetric.test', password: 'Student123!' };

const img = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=900&q=80`;

// owner: index into DEMO_OWNERS
const DORMS = [
  { owner: 0, name: 'Maple Residence', location: 'Golden Country Homes, Alangilan, Batangas City', price: 2800, utilities: 400, room: 'Shared Room', spaces: 3, rating: 4.5, distance: 1.2, amenities: ['Wi-Fi', 'Furnished', 'CCTV'], image: img('1600607687939-ce8a6c25118c'), description: 'A comfortable shared accommodation option with furnished common areas and a convenient location for students.', contact: 'Maple Residence Admin' },
  { owner: 0, name: 'Pine Crest Dormitory', location: 'Golden Country Homes, Alangilan, Batangas City', price: 2500, utilities: 300, room: 'Private Room', spaces: 2, rating: 4.3, distance: 1.4, amenities: ['Wi-Fi', 'Furnished', 'Laundry'], image: img('1600210492486-724fe5c67fb0'), description: 'A simple, bright student residence with private room options and practical everyday amenities.', contact: 'Pine Crest Management' },
  { owner: 0, name: 'Cedar Hall', location: 'Near BatStateU, Alangilan, Batangas City', price: 2700, utilities: 300, room: 'Shared Room', spaces: 4, rating: 4.2, distance: 0.8, amenities: ['Wi-Fi', 'Furnished', 'Utilities included'], image: img('1600566753086-00f18fb6b3ea'), description: 'A campus-oriented dorm option for students looking for a shared room and easy access to daily essentials.', contact: 'Cedar Hall Owner' },
  { owner: 0, name: 'Willow Dormitory', location: 'Golden Country Homes, Alangilan, Batangas City', price: 2200, utilities: 400, room: 'Bunk Bed', spaces: 5, rating: 4.0, distance: 1.7, amenities: ['Wi-Fi', 'Laundry', 'CCTV'], image: img('1555854877-bab0e564b8d5'), description: 'Budget-oriented bunk accommodation with shared facilities and a focus on practical student living.', contact: 'Willow Dormitory' },
  { owner: 0, name: 'Oak Residences', location: 'San Isidro, Alangilan, Batangas City', price: 3000, utilities: 400, room: 'Studio Type', spaces: 2, rating: 4.7, distance: 2.1, amenities: ['Wi-Fi', 'Furnished', 'Utilities included'], image: img('1600607687920-4e2a09cf159d'), description: 'A studio-style accommodation for students who prefer a more private living space.', contact: 'Oak Residences' },
  { owner: 0, name: 'Student Haven', location: 'Alangilan, Batangas City', price: 1800, utilities: 500, room: 'Shared Room', spaces: 1, rating: 4.1, distance: 1.5, amenities: ['Wi-Fi', 'CCTV'], image: img('1522708323590-d24dbb6b0267'), description: 'An economical shared-room option with essential connectivity and security features.', contact: 'Student Haven' },
  { owner: 1, name: 'Sunrise Boarding House', location: 'Alangilan, Batangas City', price: 1500, utilities: 450, room: 'Bunk Bed', spaces: 0, rating: 3.9, distance: 2.4, amenities: ['Furnished', 'Laundry'], image: img('1616486338812-3dadae4b4ace'), description: 'A basic boarding-house setup. Contact the owner to ask about future vacancies.', contact: 'Sunrise Boarding House' },
  { owner: 1, name: 'Bluebell Student Living', location: 'Near Alangilan Campus, Batangas City', price: 3200, utilities: 250, room: 'Private Room', spaces: 2, rating: 4.6, distance: 0.9, amenities: ['Wi-Fi', 'Furnished', 'Laundry', 'Utilities included', 'CCTV'], image: img('1600607687644-c7171b42498f'), description: 'A private-room option with several listed inclusions and a relatively short stated distance to campus.', contact: 'Bluebell Living' },
  { owner: 1, name: 'Garden Gate Dorm', location: 'Golden Country Homes, Alangilan, Batangas City', price: 2400, utilities: 350, room: 'Shared Room', spaces: 3, rating: 4.4, distance: 1.3, amenities: ['Wi-Fi', 'Furnished', 'CCTV'], image: img('1600566753190-17f0baa2a6c3'), description: 'A shared student accommodation with furnished spaces and listed security features.', contact: 'Garden Gate' },
  { owner: 1, name: 'Northview Rooms', location: 'Alangilan, Batangas City', price: 2000, utilities: 500, room: 'Private Room', spaces: 0, rating: 4.0, distance: 2.0, amenities: ['Wi-Fi', 'Furnished'], image: img('1600210491369-e753d80a41f3'), description: 'Private room listings currently shown as full in this demonstration dataset.', contact: 'Northview Rooms' },
  { owner: 1, name: 'Campus Corner', location: 'Near BatStateU, Alangilan, Batangas City', price: 2900, utilities: 250, room: 'Studio Type', spaces: 1, rating: 4.6, distance: 0.7, amenities: ['Wi-Fi', 'Furnished', 'Utilities included'], image: img('1600607687939-ce8a6c25118c'), description: 'A compact studio-style listing close to the campus area according to sample listing data.', contact: 'Campus Corner' },
  { owner: 1, name: 'Acacia Student Lodge', location: 'Alangilan, Batangas City', price: 2300, utilities: 350, room: 'Shared Room', spaces: 4, rating: 4.2, distance: 1.8, amenities: ['Wi-Fi', 'Laundry', 'CCTV'], image: img('1600566752355-35792bedcfea'), description: 'A shared student lodge with Wi-Fi and laundry listed among its amenities.', contact: 'Acacia Lodge' }
];

async function seedDemoData() {
  const ownerIds = [];
  const addUser = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)');
  const hashes = await Promise.all([...DEMO_OWNERS, DEMO_STUDENT].map((u) => hashPassword(u.password)));

  tx(() => {
    DEMO_OWNERS.forEach((o, i) => ownerIds.push(Number(addUser.run(o.name, o.email, hashes[i], 'owner').lastInsertRowid)));
    const studentId = Number(addUser.run(DEMO_STUDENT.name, DEMO_STUDENT.email, hashes[2], 'student').lastInsertRowid);

    const insDorm = db.prepare(`INSERT INTO dorms (owner_id, name, location, price, utilities, room_type, spaces, distance_km, rating,
      description, image, contact_name, views, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now','-30 days'),datetime('now','-30 days'))`);
    const insAmenity = db.prepare('INSERT INTO dorm_amenities (dorm_id, amenity) VALUES (?,?)');
    const dormIds = DORMS.map((d, i) => {
      const id = Number(insDorm.run(ownerIds[d.owner], d.name, d.location, d.price, d.utilities, d.room, d.spaces, d.distance,
        d.rating, d.description, d.image, d.contact, 20 + ((i + 1) * 37) % 90).lastInsertRowid);
      d.amenities.forEach((a) => insAmenity.run(id, a));
      return id;
    });

    const insInq = db.prepare('INSERT INTO inquiries (dorm_id, student_id, message, phone, status) VALUES (?,?,?,?,?)');
    insInq.run(dormIds[0], studentId, 'Hi! Is there still a slot for the next semester? I am a 2nd-year IT student.', '0917 123 4567', 'new');
    insInq.run(dormIds[1], studentId, 'Good day! May I schedule a visit this weekend?', null, 'contacted');
    insInq.run(dormIds[7], studentId, 'Hello, is the monthly rate negotiable for a one-year stay?', '0917 123 4567', 'new');
    db.prepare('INSERT INTO saved_dorms (user_id, dorm_id) VALUES (?,?)').run(studentId, dormIds[4]);
  });
}

async function seedIfEmpty() {
  if (process.env.SEED_DEMO_DATA === 'false') return false;
  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) return false;
  await seedDemoData();
  return true;
}

module.exports = { seedIfEmpty, DEMO_OWNERS, DEMO_STUDENT };

if (require.main === module) {
  (async () => {
    if (process.argv.includes('--reset')) {
      db.exec('PRAGMA foreign_keys = OFF; DELETE FROM inquiries; DELETE FROM saved_dorms; DELETE FROM dorm_amenities; DELETE FROM dorms; DELETE FROM users; DELETE FROM sqlite_sequence; PRAGMA foreign_keys = ON;');
      const { UPLOAD_DIR } = require('./db');
      for (const f of fs.readdirSync(UPLOAD_DIR)) fs.rmSync(`${UPLOAD_DIR}/${f}`, { force: true });
    }
    console.log((await seedIfEmpty()) ? 'Demo data added.' : 'Database already has data (use --reset to start over).');
  })();
}
