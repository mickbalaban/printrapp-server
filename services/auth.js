var db = require('../config/database')
  , sha1 = require('sha1')
  , awsc = require('../config/aws')
  , hat = require('hat')
  , color = require('colors')
  , _ = require('underscore')
  , jwt = require('jsonwebtoken')
  , UserModel = require('../models/user_model')
  , Mailer = require('../util/mailer')
  , rp = require('request-promise');

module.exports = function(app)
{
  app.post('/api/login', function(req, res)
  {
    if (!req.body.email || !req.body.passwd)
        return res.sendStatus(401);

    UserModel.authenticateUser(req.body.email, req.body.passwd)
    .then(function(user) {
      // check if verified
      if (!user.verified)
        throw new Error("User not verified");
      // check if active
      if (!user.active)
        throw new Error("User not active");
      // all good
      var _user = {
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          id: user._id
      }
      var token = jwt.sign(_user, awsc.secret);
      res.json({login: true, 'jwt':token});
    })
    .catch(function(err) {
      console.log(err)
      return res.json({login: false});
    })
  });

  app.post('/api/register', function(req, res) {
    // verify that we have all required fields
    var required = ['first_name', 'last_name', 'email', 'password', 'serial'];
    var valid = true;
    _.each(required, function(r) {
      if (!req.body[r])
        valid = false;
    }, this)

    if (!valid) {
      return res.sendStatus(400);
    }

    function firstUpper(string) {
      string = string.toLowerCase();
      return string.charAt(0).toUpperCase() + string.slice(1);
    }

    var first_name = firstUpper(req.body.first_name)
      , last_name = firstUpper(req.body.last_name)
      , email = req.body.email.toLowerCase()
      , token = hat();

    // verify email format and password length
    var re = /^([\w-]+(?:\.[\w-]+)*)@((?:[\w-]+\.)*\w[\w-]{0,66})\.([a-z]{2,6}(?:\.[a-z]{2})?)$/i;
    if (!re.test(email))
      return res.json({ status: 'error', message: 'Invalid email format' });

    if (req.body.password.length < 4)
      return res.json({ status: 'error', message: 'Password must be at least 4 characters long' });

    // verify serial number
    var options = {
      url: 'http://botdb.printrbot.com/api/serialcheck',
      method: 'POST',
      form: {
        serial: req.body.serial
      }
    }

    rp(options).then(function(b) {
      console.info("SERIAL > ", b)
      b = JSON.parse(b)

      console.info(b.serial);
      console.info(b.name);
      UserModel.getUserByEmail(email)
      .then(function(user) {
        if (!user) {
          // create user
          var ud = {
            email: email,
            first_name: first_name,
            last_name: last_name,
            password: sha1(req.body.password + awsc.secret),
            active: false,
            verified: false,
            token: token,
            serial: req.body.serial
          }
          UserModel.create(ud)
          .then(function(user) {
            console.info("USER CREATED");
            // send registration email
            return Mailer.sendVerificationEmail(email, token)
          })
          .then(function(e) {
            res.json({ status: 'success'});
          })
        } else {
          // already exists
          res.json({ status: 'error', message: 'Email already registered'});
        }
      })
      .catch(function(err) {
        console.info("DB ERROR FETCHING USER BY EMAIL");
        console.error(err);
        res.json({status: 'error', message: 'Internal error, please try again'})
      })

    })
    .catch(function(err) {
      console.info(err);
      res.json({ status: 'error', message: 'Invalid Serial Number'});
      return;
    })
  });


  app.post('/api/sendpasswordreset', function(req, res) {
    // verify that we have all required fields
    var required = ['email'];
    var valid = true;
    _.each(required, function(r) {
      if (!req.body[r])
        valid = false;
    }, this)

    if (!valid) {
      return res.sendStatus(400);
    }

    var email = req.body.email.toLowerCase()
      , token = hat();

    // verify email format and password length
    var re = /^([\w-]+(?:\.[\w-]+)*)@((?:[\w-]+\.)*\w[\w-]{0,66})\.([a-z]{2,6}(?:\.[a-z]{2})?)$/i;
    if (!re.test(email))
      return res.json({ status: 'error', message: 'Invalid email format' });


      UserModel.getUserByEmail(email)
      .then(function(user) {
        if (user) {
          // set the token that will be used to verify user
          user.token = token;

          UserModel.update(user)
          .then(function(u) {
            return Mailer.sendPasswordResetEmail(email, user.token)
          })
          .then(function(e) {
            res.json({status: "success"});
          })
        } else {
          // already exists
          res.json({ status: 'error', message: 'We could not find account with this email'});
        }
     })
     .catch(function(err) {
        console.info("DB ERROR FETCHING USER BY EMAIL");
        console.error(err);
        res.json({status: 'error', message: 'Internal error, please try again'})
     })
  });

  app.get('/user/verify', function(req, res) {
    UserModel.getUserByEmail(req.query.email)
    .then(function(user) {
      // check if verified
      if (user.vefiried)
        throw new Error('User already verified');
      // verify
      console.info(req.query)
      if (user.token != req.query.verify)
        throw new Error('Invalid verification');

      delete user.token;
      user.verified = true;
      user.active = true;
      UserModel.update(user)
      .then(function(u) {
        res.render('verify', { verified: true });
      })

      // activate
    })
    .catch(function(err) {
      // show error message
      res.render('verify', { verified: false, error: err });
    })
  });

  app.get('/user/resetpassword', function(req, res) {
    UserModel.getUserByEmail(req.query.email)
    .then(function(user) {
      // verify
      console.info(req.query)
      if (user.token != req.query.token)
        throw new Error('Invalid token. This password reset link is not valid.');
      res.render('passreset', { token: req.query.token, email: req.query.email });
    })
    .catch(function(err) {
      // show error message
      console.info("ERROR: ", err);
      res.render('error', { text: err });
    })
  });

  app.post('/user/resetpassword', function(req, res) {

    var required = ['email', 'token', 'password'];
    var valid = true;
    _.each(required, function(r) {
      if (!req.body[r])
        valid = false;
    }, this)

    if (!valid)
      return res.render('error', {text: 'Please provide all required info'});

    if (req.body.password.length < 4)
      return res.render('error', {text: 'Password must be at least 4 characters long' });

    UserModel.getUserByEmail(req.body.email)
    .then(function(user) {
      if (user.token != req.body.token)
        throw new Error('Invalid token. This password reset link is not valid.');

      delete user.token;
      user.verified = true;
      user.active = true;
      user.password = sha1(req.body.password + awsc.secret),
      UserModel.update(user)
      .then(function(u) {
        res.json({ status: 'success'});
      })
    })
    .catch(function(err) {
      // show error message
      console.info("ERROR: ", err);
      res.json({status: 'error', message: err})
    })
  });

};
