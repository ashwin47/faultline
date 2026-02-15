module API
  class BaseController < ApplicationController
    before_action :force_json_format
    before_action :authenticate_user!

    rescue_from Pundit::NotAuthorizedError, with: :forbidden

    private

    def current_account_id
      params[:account_id] || current_user&.last_active_account_id
    end

    def current_account
      @current_account ||= Account.find(current_account_id) if current_account_id
    end

    def current_membership
      @current_membership ||= AccountMember.find_by(
        account_id: current_account_id,
        user_id: current_user.id
      )
    end

    # Pundit uses this as the first argument to policies
    def pundit_user
      OpenStruct.new(user: current_user, membership: current_membership)
    end

    def force_json_format
      request.format = :json
    end

    def forbidden(_exception)
      render_error('You do not have permission to perform this action', status: :forbidden)
    end
  end
end
