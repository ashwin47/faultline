Rails.application.config.filter_parameters += %i[
  password password_hash token secret api_key access_key secret_key
]
