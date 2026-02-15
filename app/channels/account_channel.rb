class AccountChannel < ApplicationCable::Channel
  def subscribed
    stream_from "account:#{current_account_id}"
  end

  def unsubscribed
    stop_all_streams
  end
end
