const express = require('express')
const app = express()
const bodyParser = require('body-parser')
const shortid = require('shortid')
const moment = require('moment')
const cors = require('cors')

const mongoose = require('mongoose')
process.env.MLAB_URI = 'mongodb://public:public1@ds024778.mlab.com:24778/exercise-tracker'
mongoose.connect(process.env.MLAB_URI || 'mongodb://localhost/exercise-track' )

mongoose.Promise = Promise

const userSchema = new mongoose.Schema({
  userName: { type: String, required: true, unique: true },
  _id: { type: String, default: shortid.generate },
  log: { type: Array }
})

const User = mongoose.model('User', userSchema)

app.use(cors())

app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())


app.use(express.static('public'))
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});

// create new user
app.post('/api/exercise/new-User', (req, res) => {
  const userName = req.body.username
  User.create({ userName: userName})
  .then(newUser => {
    res.json({ userName: userName,
               _id: newUser._id })
  })
  .catch(err => {
    res.json({ error: err.code == 11000 ? 'username already taken' : err.message })  
    
  })
})

// get all users
app.get('/api/exercise/users', (req, res) => {
  User.find().select('userName _id')
  .then(allUsers => {
    res.json(allUsers)
  })
  .catch(err => {
    res.json({ error: 'connection to database failed' })
  })
})

// add exercise to user
app.post('/api/exercise/add', (req, res) => {
  const exercise = req.body
  let { date, userId } = exercise
  date = date || new Date() // sets current date as fallback value 
  exercise.date = moment(date).format('YYYY-MM-DD') // normalizes dates to datestring
  exercise.duration = Number(exercise.duration)
  delete exercise.userId // exclude userId from being written to every database log entry
  
  // added options: select fields, return updated document, return document as plain js object
  User.findByIdAndUpdate(userId, { $push: { log: exercise }}, { fields: { userName:1 }, new: true, lean: true})
  .then(updatedUser => {
    if (!updatedUser) {
      throw { message: 'userId not found' }
    }
    res.json(Object.assign({}, updatedUser, exercise)) // join the user object and the exercise object properties
  })
  .catch(err => {
    res.json({ error: err.message })
  })
})

// get user log
app.get('/api/exercise/log', (req, res) => {
  let { userId, from, to, limit } = req.query
  limit = Number(limit)
  
  User.findById(userId, 'userName log', { lean: true })
  .then(foundUser => {
    if (!foundUser) { 
      throw { message: 'userId not found' }
    }
    let filteredLog = foundUser.log
    if (from && to) {
      foundUser.to = to
      foundUser.from = from
      filteredLog = foundUser.log.filter(entry => {
        return moment(entry.date).isSameOrAfter(from) && moment(entry.date).isSameOrBefore(to) 
      })
    } else if (from && !to) {
      foundUser.from = from
      filteredLog = foundUser.log.filter(entry => {
        return moment(entry.date).isSameOrAfter(from) || moment(entry.date).isSame(from)
      })
    } else if (!from && to) {
      foundUser.to = to
      filteredLog = foundUser.log.filter(entry => {
        return moment(entry.date).isSameOrBefore(to)
      })
    }
    filteredLog.sort((a, b) => {
      if (moment(a.date).isBefore(b.date)) { return 1 }
      if (moment(a.date).isAfter(b.date)) { return -1 }
      return 0
    })
    
    let outputLog = filteredLog
    
    if (limit) {
      foundUser.limit = limit
      outputLog = filteredLog.slice(0, limit)
    }
    foundUser.count = outputLog.length
    foundUser.log = outputLog
    
    res.json(foundUser)
  })
  .catch(err => res.json({ error: err.message }))
})

// Not found middleware
app.use((req, res, next) => {
  return next({status: 404, message: 'not found'})
})

// Error Handling middleware
app.use((err, req, res, next) => {
  let errCode, errMessage

  if (err.errors) {
    // mongoose validation error
    errCode = 400 // bad request
    const keys = Object.keys(err.errors)
    // report the first validation error
    errMessage = err.errors[keys[0]].message
  } else {
    // generic or custom error
    errCode = err.status || 500
    errMessage = err.message || 'Internal Server Error'
  }
  res.status(errCode).type('txt')
    .send(errMessage)
})

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
})
