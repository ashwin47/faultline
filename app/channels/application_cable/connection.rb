module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :current_user_id, :current_account_id

    def connect
      token = request.params[:token]
      reject_unauthorized_connection unless token

      payload = Warden::JWTAuth::TokenDecoder.new.call(token)
      user = User.find(payload['sub'])

      # Verify token hasn't been revoked (JTI matcher strategy)
      reject_unauthorized_connection unless user.jti == payload['jti']

      self.current_user_id = user.id
      self.current_account_id = payload['account_id']
    rescue JWT::DecodeError, JWT::ExpiredSignature, ActiveRecord::RecordNotFound
      reject_unauthorized_connection
    end
  end
end
