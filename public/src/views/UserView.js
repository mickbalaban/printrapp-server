define([
  'app',
  'models/session',
  'models/profile',
  'text!templates/user.html'
],

function(
   app,
   session,
   profile,
   Tpl
)
{

    var v = Backbone.View.extend(
    {
        className: 'userview',

        events: {
          'click button.register-btn': 'onFormSubmit',
          /*
          'keypress': function(e) {
            if (e.which == 13)
              this.onFormSubmit(e);
          }
          */
        },

        initialize: function(o)
        {
            this.tpl = _.template(Tpl);
            this.hasErrors = false;

        },

        validateEmpty: function(o)
        {
          var e = $('#'+o);
          if (!e.val()) {
            e.parent().addClass('has-error');
            this.hasErrors = true;
          } else {
            e.parent().removeClass('has-error');
          }
        },

        onFormSubmit: function()
        {
          this.hasErrors = false;

          var required = ['first_name', 'last_name', 'email', 'password'];
          _.each(required, function(e) {
            this.validateEmpty(e);
          }, this)

          if (this.hasErrors)
            return app.alert('error', 'Please fill out all required fields and try again');

          var printer = printerTypes.filterByType($('#printer_model').val());

          // disable submit button
          $('.register-btn').prop("disabled",true);

            // ajax post
            $.ajax({
              method: "POST",
              url: app.hostUrl + '/api/register',
              data: {
                first_name: $('#first_name').val(),
                last_name: $('#last_name').val(),
                email: $('#email').val(),
                password: $('#password').val(),
              }
            })
            .done(function(msg) {

                $('.register-btn').prop("disabled",false);

                if (msg.status == "error") {
                  app.alert('error', msg.message);
                }

                if (msg.status == "success") {
                  app.alert('info', "Success");
                };

                Backbone.history.navigate('login', true);
            })
            .fail(function( jqXHR, textStatus ) {
                app.alert('error', 'There was a problem submitting this form. Please check your data and try again.');
                $('.register-btn').prop("disabled",false);
            });

        },

        render: function() {
            this.$el.html(this.tpl({session: session, profile: profile}));
            return this.$el;
        }
    });

    return v;
});
