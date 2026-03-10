var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
let mongoose = require('mongoose')

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/api/v1/products', require('./routes/products'));
app.use('/api/v1/categories', require('./routes/categories'));

mongoose.connect('mongodb://localhost:27017/NNPTUD-C3');
mongoose.connection.on('connected',()=>{
  console.log("connected");
})
mongoose.connection.on('disconnected',()=>{
  console.log("disconnected");
})


// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

function getApiErrorStatus(err) {
  if (err.status || err.statusCode) return err.status || err.statusCode;
  if (err.name === 'ValidationError') return 400;
  if (err.name === 'CastError') return 400;
  if (err.code === 11000) return 409;
  return 500;
}

function getApiErrorBody(err, status) {
  if (err.name === 'ValidationError') {
    return {
      message: 'Validation failed',
      details: Object.values(err.errors || {}).map((item) => item.message),
    };
  }

  if (err.code === 11000) {
    return {
      message: 'Duplicate value violates a unique field',
      details: { keyValue: err.keyValue || {} },
    };
  }

  if (status === 404) {
    return { message: err.message || 'Resource not found' };
  }

  if (status === 400) {
    return { message: err.message || 'Bad request' };
  }

  return { message: err.message || 'Internal server error' };
}

// error handler
app.use(function(err, req, res, next) {
  const status = getApiErrorStatus(err);

  if (req.originalUrl.startsWith('/api/')) {
    const body = getApiErrorBody(err, status);
    if (req.app.get('env') === 'development' && status === 500) {
      body.stack = err.stack;
    }
    return res.status(status).json(body);
  }

  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(status);
  res.render('error');
});

module.exports = app;
