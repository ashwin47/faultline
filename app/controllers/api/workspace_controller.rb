module API
  class WorkspaceController < BaseController
    def members
      @members = WorkspaceService.list_members(current_account_id)
      @pending_invites = WorkspaceService.list_pending_invites(current_account_id)
    end

    def create_invite
      authorize current_account, :invite_member?

      @invite = WorkspaceService.invite_member(
        account_id: current_account_id,
        invited_by_user_id: current_user.id,
        email: invite_params[:email],
        role: invite_params[:role]
      )
    rescue StandardError => e
      render_error(e.message)
    end

    def accept_invite
      token = params.require(:token)

      @result = WorkspaceService.accept_invite(token: token, user_id: current_user.id)
    rescue StandardError => e
      render_error(e.message)
    end

    def remove_member
      authorize current_account, :remove_member?

      WorkspaceService.remove_member(
        account_id: current_account_id,
        requesting_user_id: current_user.id,
        target_user_id: params.require(:user_id)
      )
      render_message('Member removed')
    rescue StandardError => e
      render_error(e.message)
    end

    def update_role
      authorize current_account, :update_role?

      WorkspaceService.update_member_role(
        account_id: current_account_id,
        target_user_id: role_params[:user_id],
        new_role: role_params[:role]
      )
      render_message('Role updated')
    rescue StandardError => e
      render_error(e.message)
    end

    def cancel_invite
      authorize current_account, :cancel_invite?

      WorkspaceService.cancel_invite(
        account_id: current_account_id,
        invite_id: params.require(:invite_id)
      )
      render_message('Invite cancelled')
    rescue StandardError => e
      render_error(e.message)
    end

    def rename
      authorize current_account, :rename?

      @result = WorkspaceService.rename(account_id: current_account_id, new_name: rename_params[:name])
    rescue StandardError => e
      render_error(e.message)
    end

    private

    def invite_params
      params.permit(:email, :role)
    end

    def role_params
      params.permit(:user_id, :role)
    end

    def rename_params
      params.permit(:name)
    end
  end
end
