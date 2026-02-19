class IntegrationWebhook < ApplicationRecord
  belongs_to :account

  validates :integration, presence: true
  validates :integration_index, presence: true
  validates :token, presence: true, uniqueness: true
  validates :integration_index, uniqueness: { scope: %i[account_id integration] }

  before_validation :generate_token, on: :create

  private

  def generate_token
    self.token ||= SecureRandom.urlsafe_base64(32)
  end
end
