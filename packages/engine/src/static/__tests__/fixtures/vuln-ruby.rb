# Intentionally vulnerable Ruby code for scanner validation.
# DO NOT deploy.

class UsersController < ApplicationController

  # 21. Rails raw SQL with string interpolation
  def search
    @users = User.where("email = '#{params[:email]}'")
    render json: @users
  end

  # 22. Unescaped ERB output
  def show
    @bio = params[:bio].html_safe
    render :show
  end

  # 23. Mass assignment bypass via permit!
  def create
    @user = User.new(params.require(:user).permit!)
    @user.save
    render json: @user
  end
end
