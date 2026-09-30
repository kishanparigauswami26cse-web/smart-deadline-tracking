// Creates demo user (demo@example.com / demo1234) with sample tasks. Run: npm run seed
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Task = require('./models/Task');

const at = (days, hour) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d; };

(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/deadline-tracker');
  const old = await User.findOne({ email: 'demo@example.com' });
  if (old) { await Task.deleteMany({ user: old._id }); await old.deleteOne(); }
  const u = await User.create({ name: 'Demo Student', email: 'demo@example.com', password: await bcrypt.hash('demo1234', 10) });
  await Task.insertMany([
    { title: 'DBMS assignment', description: 'Normalization + SQL queries', deadline: at(1, 18), difficulty: 4, importance: 5 },
    { title: 'Math problem set', description: 'Chapter 5 exercises', deadline: at(2, 12), difficulty: 3, importance: 4 },
    { title: 'OS lab report', description: 'Scheduling algorithms', deadline: at(2, 17), difficulty: 3, importance: 3 },
    { title: 'Networks quiz prep', description: 'Subnetting and TCP', deadline: at(2, 9), difficulty: 2, importance: 4 },
    { title: 'Physics revision', description: 'Mechanics summary', deadline: at(0, 22), difficulty: 2, importance: 3 },
    { title: 'Project proposal', description: 'Final year project', deadline: at(5, 15), difficulty: 4, importance: 5 },
    { title: 'English essay', description: '1000 words', deadline: at(9, 10), difficulty: 2, importance: 2 },
    { title: 'Read AI paper', description: 'Optional reading', deadline: at(12, 20), difficulty: 1, importance: 1 },
    { title: 'Algorithms homework', description: 'Graphs', deadline: at(-1, 10), difficulty: 3, importance: 3, status: 'Completed' }
  ].map((t) => ({ ...t, user: u._id })));
  console.log('Seeded. Login: demo@example.com / demo1234');
  process.exit(0);
})();
