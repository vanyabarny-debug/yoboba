export type user_role = 'guest' | 'user' | 'admin' | 'barista' | 'seller';

export const session_cookie = 'yoboba_role';
export const seller_id_cookie = 'yoboba_seller_id';
export const seller_name_cookie = 'yoboba_seller_name';

export const staff_credentials = {
  login: 'admin',
  password: 'admin',
  role: 'admin' as user_role,
};

export function check_admin_credentials(login: string, password: string) {
  return (
    login.trim().toLowerCase() === staff_credentials.login &&
    password === staff_credentials.password
  );
}

/** @deprecated */
export function check_staff_credentials(login: string, password: string) {
  return check_admin_credentials(login, password);
}
