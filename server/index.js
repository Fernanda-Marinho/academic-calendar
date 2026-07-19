const path = require('path');
const express = require('express');
const cors = require('cors');

const calendarsHandler = require(path.join(__dirname, '..', 'api', 'calendars.js'));
const parseHandler = require(path.join(__dirname, '..', 'api', 'parse.js'));

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/calendars', (req, res) => calendarsHandler(req, res));
app.get('/api/parse', (req, res) => parseHandler(req, res));

app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
});

const port = process.env.PORT || 3004;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
