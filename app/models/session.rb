class Session < ApplicationRecord
  belongs_to :user

  def touch_last_active!
    update_column(:last_active_at, Time.current)
  end
end
