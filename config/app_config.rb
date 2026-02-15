# Centralised environment access — every ENV read goes through here.
# Loaded before the Rails application boots (required in config/application.rb).

module AppConfig
  module_function

  # ── Database ────────────────────────────────────────────────
  def database_url
    ENV.fetch('DATABASE_URL', nil)
  end

  def db_pool
    ENV.fetch('RAILS_MAX_THREADS', 5).to_i
  end

  # ── Redis ───────────────────────────────────────────────────
  def redis_url
    ENV.fetch('REDIS_URL', 'redis://localhost:6379/0')
  end

  # ActionCable uses a separate Redis DB by default
  def cable_redis_url
    ENV.fetch('REDIS_URL', 'redis://localhost:6379/1')
  end

  # ── Security ────────────────────────────────────────────────
  def secret_key_base
    ENV.fetch('SECRET_KEY_BASE')
  end

  def jwt_secret
    ENV.fetch('JWT_SECRET', 'dev-secret-change-in-production')
  end

  # Used only by the data migration to decrypt old custom-encrypted settings
  def encryption_key
    secret_key_base[0..31]
  end

  # ── Agent service ───────────────────────────────────────────
  def agent_service_url
    ENV.fetch('AGENT_SERVICE_URL', 'http://localhost:8000')
  end

  # ── Web server ──────────────────────────────────────────────
  def port
    ENV.fetch('PORT', 3000).to_i
  end

  def rails_env
    ENV.fetch('RAILS_ENV', 'development')
  end

  def rails_max_threads
    ENV.fetch('RAILS_MAX_THREADS', 5).to_i
  end

  def rails_min_threads
    ENV.fetch('RAILS_MIN_THREADS', rails_max_threads).to_i
  end

  def pidfile
    ENV.fetch('PIDFILE', 'tmp/pids/server.pid')
  end

  # ── Sidekiq ─────────────────────────────────────────────────
  def sidekiq_concurrency
    ENV.fetch('SIDEKIQ_CONCURRENCY', 5).to_i
  end

  # ── CORS ────────────────────────────────────────────────────
  def cors_origin
    ENV.fetch('CORS_ORIGIN', 'http://localhost:5173')
  end

  # ── SMTP / Email ────────────────────────────────────────────
  def smtp_host
    ENV.fetch('SMTP_HOST', nil)
  end

  def smtp_from
    ENV.fetch('SMTP_FROM', 'noreply@faultline.dev')
  end

  def email_configured?
    smtp_host.present?
  end

  # ── Logging ─────────────────────────────────────────────────
  def log_level
    ENV.fetch('LOG_LEVEL', 'debug').to_sym
  end

  def rails_log_level
    ENV.fetch('RAILS_LOG_LEVEL', 'info').to_sym
  end

  # ── CI ──────────────────────────────────────────────────────
  def ci?
    ENV['CI'].present?
  end
end
