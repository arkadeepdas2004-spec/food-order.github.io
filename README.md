# FreshBite

A responsive food-ordering app built with Node.js and browser-native HTML, CSS, and JavaScript. It includes menu search and filters, a persistent cart, server-side order validation, delivery-fee calculation, customer accounts, and checkout.

## Run locally

Install dependencies once:

```powershell
npm install
```

Start MySQL and create a user that can create the app database. By default the app connects to:

- Host: `localhost`
- Port: `3306`
- User: `root`
- Password: empty
- Database: `food_order`

Override those defaults with environment variables when needed:

```powershell
$env:MYSQL_HOST="localhost"
$env:MYSQL_PORT="3306"
$env:MYSQL_USER="root"
$env:MYSQL_PASSWORD="your-password"
$env:MYSQL_DATABASE="food_order"
npm start
```

On Windows, double-click `START_APP.cmd` and keep its terminal window open.

Or run it manually:

```powershell
npm start
```

Open <http://localhost:3000>.

On first startup with an empty database, the server creates the tables and imports existing data from the JSON files in `data/`.

## API

- `GET /api/products` - list menu items
- `POST /api/user/register` - create a customer account
- `POST /api/user/login` - customer sign in
- `POST /api/user/2fa/verify` - verify the customer sign-in code
- `POST /api/user/logout` - customer sign out
- `GET /api/user/me` - current signed-in customer
- `POST /api/orders` - place an order (customer authentication required)
- `POST /api/my-orders` - list signed-in customer orders
- `GET /api/orders` - list orders (admin authentication required)
- `POST /api/admin/login` - admin sign in
- `POST /api/admin/2fa/verify` - verify the admin sign-in OTP
- `POST /api/admin/logout` - admin sign out
- `GET /api/health` - health check

Orders, menu products, coupons, customer accounts, addresses, and wishlists are saved to MySQL. Passwords are stored as salted hashes.

Database access uses parameterized queries through `mysql2.execute(...)` for application data. Do not run the app as MySQL `root` outside local development. Create a least-privilege app user after the database exists:

```sql
CREATE USER 'food_order_app'@'localhost' IDENTIFIED BY 'change-this-password';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX
ON food_order.* TO 'food_order_app'@'localhost';
FLUSH PRIVILEGES;
```

Then start the app with that user:

```powershell
$env:MYSQL_USER="food_order_app"
$env:MYSQL_PASSWORD="change-this-password"
npm start
```

Use a separate backup user with read-only privileges:

```sql
CREATE USER 'food_order_backup'@'localhost' IDENTIFIED BY 'change-this-backup-password';
GRANT SELECT, SHOW VIEW, TRIGGER, EVENT, LOCK TABLES
ON food_order.* TO 'food_order_backup'@'localhost';
FLUSH PRIVILEGES;
```

Create an on-demand backup:

```powershell
$env:MYSQL_BACKUP_USER="food_order_backup"
$env:MYSQL_BACKUP_PASSWORD="change-this-backup-password"
npm run db:backup
```

Set `BACKUP_DIR` to choose the output folder. Set `BACKUP_ENCRYPTION_KEY` to write encrypted `.sql.enc` backups instead of plain `.sql` files. Schedule `npm run db:backup` daily with Windows Task Scheduler or your server scheduler, and regularly test restores.

For encryption at rest, enable storage-level or MySQL tablespace encryption on the database host, and keep backups on encrypted storage. Application code cannot guarantee disk encryption by itself; this must be enforced by the MySQL/server platform.

Authentication endpoints are rate-limited to slow brute-force attacks:

- Customer login: 10 attempts per 15 minutes
- Customer registration: 5 attempts per hour
- Admin login: 5 attempts per 15 minutes

Limits are tracked by client IP and by the submitted phone number or username.

All responses include security headers, including Content Security Policy, `X-Frame-Options`, HSTS, `Referrer-Policy`, and `Permissions-Policy`.

The admin panel also records IP addresses, user agents, login history, and admin activity in MySQL. The admin account locks after 5 failed credential attempts for 15 minutes, and admin sessions expire after 30 minutes of inactivity. Override these with `ADMIN_LOCK_MAX_FAILURES`, `ADMIN_LOCK_MINUTES`, and `ADMIN_IDLE_TIMEOUT_MINUTES`.

Admin write endpoints are protected with CSRF tokens. The admin dashboard fetches a token from `GET /api/admin/csrf` and sends it in the `X-CSRF-Token` header when creating, updating, or deleting products, changing coupons, logging out, and updating order status.

## Customer accounts

Open <http://localhost:3000/login.html> to create a customer account or sign in. Customers must be signed in before placing orders or viewing their order history.

Customer registration requires a strong password: at least 10 characters with uppercase, lowercase, number, and symbol characters, with no spaces, phone number, or customer name. Sign-in and registration both require a 6-digit 2FA code before the session cookie is created. In local development the code is shown on the page and printed in the server terminal.

## Admin dashboard

Open <http://localhost:3000/admin.html>. For local development the default login is:

- Username: `admin`
- Password: `admin123`

Set `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `ADMIN_PHONE` environment variables before starting the server to use your own admin credentials and OTP phone number. The default admin OTP phone is `8293532857`.

Admin sign-in also requires a 6-digit OTP after the username and password are accepted. Without an SMS provider, the admin OTP is shown on the page and printed in the server terminal for the configured admin phone.

To send OTPs by SMS, configure one provider before starting the server:

```powershell
$env:SMS_PROVIDER="fast2sms"
$env:FAST2SMS_API_KEY="your-fast2sms-api-key"
npm start
```

Or Twilio:

```powershell
$env:SMS_PROVIDER="twilio"
$env:TWILIO_ACCOUNT_SID="your-account-sid"
$env:TWILIO_AUTH_TOKEN="your-auth-token"
$env:TWILIO_FROM_PHONE="+1234567890"
npm start
```

You can also set `OTP_SMS_WEBHOOK_URL` to call your own SMS service. The app sends a JSON `POST` request with `phone`, `code`, and `message` fields. If SMS fails, the app falls back to showing and logging the OTP so sign-in still works.

The admin dashboard supports viewing orders, updating delivery status, and adding or editing menu products. Product changes are saved to MySQL and remain after the server restarts.
