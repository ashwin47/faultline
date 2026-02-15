module API
  class SettingsController < BaseController
    def index
      @settings = current_account.settings.visible
    end

    def update
      permitted = settings_params
      return render_error('Invalid settings payload') if permitted[:settings].blank?

      Setting.transaction do
        permitted[:settings].each do |key, value|
          next if value.nil?

          record = current_account.settings.find_or_initialize_by(key: key.to_s)
          record.update!(value: value.to_s)
        end
      end

      render_success
    rescue ActiveRecord::RecordInvalid => e
      render_error(e.record.errors.full_messages.join(', '))
    end

    def status
      @integrations = integration_status
    end

    def test_connection
      integration = params.require(:integration)
      valid = %w[openai newrelic sentry aws github pagerduty]
      return render_error('Invalid integration name') unless valid.include?(integration)

      @result = if integration_status[integration.to_sym]
                  { success: true, message: "#{integration} configuration is valid." }
                else
                  { success: false, message: "Missing required configuration for #{integration}" }
                end
    end

    def destroy_integration
      integration = params[:integration]
      index = params[:index].to_i
      valid = %w[newrelic sentry aws github pagerduty]
      return render_error('Invalid integration name') unless valid.include?(integration)

      prefix = "#{integration}.#{index}."

      Setting.transaction do
        # Delete all keys for this instance
        current_account.settings.where('key LIKE ?', "#{prefix}%").destroy_all

        # Reindex higher instances (N+1 → N, N+2 → N+1, etc.)
        higher = current_account.settings.where('key LIKE ?', "#{integration}.%")
                                         .order(:key)

        higher.each do |setting|
          match = setting.key.match(/\A#{Regexp.escape(integration)}\.(\d+)\.(.+)\z/)
          next unless match

          old_index = match[1].to_i
          field = match[2]
          next unless old_index > index

          setting.update_columns(key: "#{integration}.#{old_index - 1}.#{field}")
        end
      end

      render_success
    end

    private

    def settings_params
      params.permit(settings: {})
    end

    def integration_status
      keys = current_account.settings.visible.pluck(:key)

      {
        openai: keys.include?('openai.api_key'),
        newrelic: keys.any? { |k| k.match?(/\Anewrelic\.\d+\.api_key\z/) },
        sentry: keys.any? { |k| k.match?(/\Asentry\.\d+\.auth_token\z/) },
        aws: keys.any? { |k| k.match?(/\Aaws\.\d+\.access_key_id\z/) },
        github: keys.any? { |k| k.match?(/\Agithub\.\d+\.token\z/) },
        pagerduty: keys.any? { |k| k.match?(/\Apagerduty\.\d+\.api_key\z/) }
      }
    end
  end
end
