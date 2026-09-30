const router = require('express').Router();
const Task = require('../models/Task');
const auth = require('../middleware/auth');

router.use(auth); // every task route needs login

// Only allow these fields from the client
const pick = (b) => ({
  title: b.title, description: b.description, deadline: b.deadline,
  difficulty: b.difficulty, importance: b.importance, status: b.status
});

router.get('/', async (req, res) => {
  res.json(await Task.find({ user: req.userId }).sort({ deadline: 1 }));
});

router.post('/', async (req, res) => {
  try { res.status(201).json(await Task.create({ ...pick(req.body), user: req.userId })); }
  catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const t = await Task.findOneAndUpdate({ _id: req.params.id, user: req.userId }, pick(req.body),
      { new: true, runValidators: true });
    t ? res.json(t) : res.status(404).json({ message: 'Task not found' });
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/:id', async (req, res) => {
  const t = await Task.findOneAndDelete({ _id: req.params.id, user: req.userId });
  t ? res.json({ ok: true }) : res.status(404).json({ message: 'Task not found' });
});

module.exports = router;
