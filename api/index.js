const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');
const cron = require('node-cron');
const cors = require('cors');

const app = express();
const PORT = 3000;
app.use(cors());

// Подключение базе
mongoose.connect('mongodb+srv://savazkitim:Root898723908-42@cluster0.j4lynmw.mongodb.net/?retryWrites=true&w=majority', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

// Схема для книг
const bookSchema = new mongoose.Schema({
  date: Date,
  title: String,
});
const Book = mongoose.model('Book', bookSchema);

// Схема для опроса
const pollSchema = new mongoose.Schema({
  date: {
    type: Date,
    default: Date.now
  },
  options: [{
    title: String,
    id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Book'
    }
  }],
  active_poll: {
    type: Boolean,
    default: false
  }
});

const Poll = mongoose.model('Poll', pollSchema);

// Схема для голосов
const voteSchema = new mongoose.Schema({
  pollId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Poll',
    required: true
  },
  optionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Book',
    required: true
  }
});

const Vote = mongoose.model('Vote', voteSchema);


const BOT_TOKEN = '7285648575:AAHHlpz41jupTToP0CfbMf5qN_uc9QFoBMs';
const CHANNEL_ID = 'books_poll';

app.use(express.json());

app.post('/new_poll', async (req, res) => {
  try {
    const { options, active_poll } = req.body;
    const newPoll = new Poll({ options, active_poll });
    await newPoll.save();
    res.sendStatus(200);
  } catch (error) {
    console.error('Error creating poll:', error);
    res.sendStatus(500);
  };
});


app.get('/polls', async (req, res) => {
  try {
    const polls = await Poll.find({ active_poll: true });
    res.json(polls);
  } catch (error) {
    console.error('Error getting polls:', error);
    res.sendStatus(500);
  }
})

app.post('/vote', async (req, res) => {
  try {
    const { pollId, optionIds } = req.body;
    const existingVotes = await Vote.find({ pollId });

    const newVotes = optionIds.map(optionId => ({
      pollId,
      optionId
    }));

    await Vote.insertMany(newVotes);

    res.sendStatus(200);
  } catch (error) {
    console.error('Error voting:', error);
    res.sendStatus(500);
  }
});


app.get('/polls/:pollId/stats', async (req, res) => {
  try {
    const { pollId } = req.params;
    const votes = await Vote.find({ pollId }).populate('optionId', 'title');
    const totalVotes = votes.length;

    const optionStats = {};

    votes.forEach((vote) => {
      if (!optionStats[vote.optionId._id]) {
        optionStats[vote.optionId._id] = { count: 1, title: vote.optionId.title };
      } else {
        optionStats[vote.optionId._id].count++;
      }
    });

    const stats = Object.keys(optionStats).map((optionId) => ({
      optionId,
      title: optionStats[optionId].title,
      count: optionStats[optionId].count,
      percentage: ((optionStats[optionId].count / totalVotes) * 100).toFixed(2),
    }));

    res.json(stats);
  } catch (error) {
    console.error('Error getting vote stats:', error);
    res.sendStatus(500);
  }
});


app.get('/', async (req, res) => {
  try {
    const response = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`);
    const updates = response.data.result;

    updates.forEach(async (update) => {
      if (update.channel_post && update.channel_post.chat.username === CHANNEL_ID) {
        const newBook = new Book({
          date: new Date(),
          title: update.channel_post.text,
        });
        await newBook.save();
        console.log(`New post in channel added to MongoDB: ${update.channel_post.text}`);
      }
    });

    res.sendStatus(200);
  } catch (error) {
    console.error('Error getting updates:', error);
    res.sendStatus(500);
  }
});



app.get('/books', async (req, res) => {
  await getUpdates();
  try {
    const books = await Book.find();
    res.json(books);
  } catch (error) {
    console.error('Error getting books:', error);
    res.sendStatus(500);
  }
});

app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);
});

async function getUpdates() {
  try {
    const response = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`);
    const updates = response.data.result;
    for (const update of updates) {
      if (update.channel_post && update.channel_post.chat.username === CHANNEL_ID) {
        const existingBook = await Book.findOne({ title: update.channel_post.text });
        if (!existingBook) {
          const newBook = new Book({
            date: new Date(),
            title: update.channel_post.text,
          });
          await newBook.save();
          console.log(`New post in channel added to MongoDB: ${update.channel_post.text}`);
        } else {
          console.log(`Book already exists: ${update.channel_post.text}`);
        }
      }
    }
  } catch (error) {
    console.error('Error getting updates:', error);
  }
}

