# Devise 4.9.x conditionally defines Devise::Mailer only when ActionMailer
# is loaded. This app doesn't use ActionMailer, so tell Zeitwerk to skip
# eager-loading that directory to avoid NameError during boot.
devise_path = Gem.loaded_specs["devise"]&.full_gem_path
if devise_path
  Rails.autoloaders.each do |autoloader|
    autoloader.ignore("#{devise_path}/app/mailers")
  end
end
