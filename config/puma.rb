threads AppConfig.rails_min_threads, AppConfig.rails_max_threads

worker_timeout 3600 if AppConfig.rails_env == 'development'

port AppConfig.port

environment AppConfig.rails_env

pidfile AppConfig.pidfile

plugin :tmp_restart
