require 'devise/orm/active_record'

Devise.setup do |config|
  config.mailer_sender = AppConfig.smtp_from
  config.case_insensitive_keys = [:email]
  config.strip_whitespace_keys = [:email]
  config.skip_session_storage = %i[http_auth params_auth]
  config.stretches = Rails.env.test? ? 1 : 12
  config.password_length = 6..128
  config.sign_out_via = :delete
  config.responder.error_status = :unprocessable_entity
  config.responder.redirect_status = :see_other
  config.navigational_formats = []

  # JWT configuration
  config.jwt do |jwt|
    jwt.secret = AppConfig.jwt_secret
    jwt.dispatch_requests = [
      ['POST', %r{^/api/auth/login$}]
    ]
    jwt.revocation_requests = [
      ['POST', %r{^/api/auth/logout$}]
    ]
    jwt.expiration_time = 7.days.to_i
  end
end
