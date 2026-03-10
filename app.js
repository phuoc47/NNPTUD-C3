var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const { initDatabase, DB_CONFIG } = require('./db/mysql');

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

initDatabase()
  .then(function () {
    console.log(
      `MySQL connected: ${DB_CONFIG.user}@${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`
    );
  })
  .catch(function (error) {
    console.error('MySQL init failed:', error.message);
  });


// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

function getApiErrorStatus(err) {
  if (err.status || err.statusCode) return err.status || err.statusCode;
  if (err.type === 'entity.parse.failed') return 400;
  if (err.code === 'ER_DUP_ENTRY') return 409;
  if (err.code === 'ER_NO_REFERENCED_ROW_2') return 400;
  if (err.code === 'ER_ROW_IS_REFERENCED_2') return 400;
  if (err.code === 'ER_BAD_NULL_ERROR') return 400;
  if (err.code === 'ER_TRUNCATED_WRONG_VALUE') return 400;
  if (err.code === 'ER_DATA_TOO_LONG') return 400;
  if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') return 400;
  return 500;
}

function getApiErrorBody(err, status) {
  if (err.type === 'entity.parse.failed') {
    return {
      message: 'Invalid JSON request body',
    };
  }

  if (err.code === 'ER_DUP_ENTRY') {
    return {
      message: 'Duplicate value violates a unique field',
      details: { sqlMessage: err.sqlMessage || '' },
    };
  }

  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return {
      message: 'Referenced resource not found',
      details: { sqlMessage: err.sqlMessage || '' },
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
