class WorkspaceInvite < ApplicationRecord
  belongs_to :account
  belongs_to :invited_by_user, class_name: 'User'

  validates :email, presence: true
  validates :role, presence: true, inclusion: { in: %w[admin member] }
  validates :token, presence: true, uniqueness: true
  validates :status, presence: true, inclusion: { in: %w[pending accepted expired] }
  validates :expires_at, presence: true

  scope :pending, -> { where(status: 'pending') }
  scope :for_email, ->(email) { where(email: email.downcase) }

  before_validation :generate_token, on: :create

  def expired?
    status == 'expired' || Time.current > expires_at
  end

  def accept!
    update!(status: 'accepted')
  end

  def expire!
    update!(status: 'expired')
  end

  private

  def generate_token
    self.token ||= SecureRandom.hex(32)
  end
end
