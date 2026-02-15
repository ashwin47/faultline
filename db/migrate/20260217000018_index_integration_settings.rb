class IndexIntegrationSettings < ActiveRecord::Migration[8.0]
  INTEGRATIONS = %w[newrelic sentry aws github pagerduty].freeze

  def up
    Setting.find_each do |setting|
      prefix = INTEGRATIONS.find { |i| setting.key.start_with?("#{i}.") }
      next unless prefix

      field = setting.key.delete_prefix("#{prefix}.")
      # Skip if already indexed (e.g. "aws.0.access_key_id")
      next if field.match?(/\A\d+\./)

      setting.update_columns(key: "#{prefix}.0.#{field}")
    end
  end

  def down
    Setting.find_each do |setting|
      prefix = INTEGRATIONS.find { |i| setting.key.start_with?("#{i}.") }
      next unless prefix

      field = setting.key.delete_prefix("#{prefix}.")
      # Remove the "0." index prefix
      if field.match?(/\A0\.(.+)\z/)
        setting.update_columns(key: "#{prefix}.#{$1}")
      end
    end
  end
end
