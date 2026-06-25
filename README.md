# FreshBite

A responsive food-ordering app built with Node.js and browser-native HTML, CSS, and JavaScript. It includes menu search and filters, a persistent cart, server-side order validation, delivery-fee calculation, customer accounts, and checkout.

## Run locally

On Windows, double-click `START_APP.cmd` and keep its terminal window open.

Or run it manually:

```powershell
npm start
```

Open <http://localhost:3000>.

## API

- `GET /api/products` - list menu items
- `POST /api/user/register` - create a customer account
- `POST /api/user/login` - customer sign in
- `POST /api/user/logout` - customer sign out
- `GET /api/user/me` - current signed-in customer
- `POST /api/orders` - place an order (customer authentication required)
- `POST /api/my-orders` - list signed-in customer orders
- `GET /api/orders` - list orders (admin authentication required)
- `POST /api/admin/login` - admin sign in
- `POST /api/admin/logout` - admin sign out
- `GET /api/health` - health check

Orders are saved to `data/orders.json`. Customer accounts are saved to `data/users.json`; passwords are stored as salted hashes.

## Customer accounts

Open <http://localhost:3000/login.html> to create a customer account or sign in. Customers must be signed in before placing orders or viewing their order history.

## Admin dashboard

Open <http://localhost:3000/admin.html>. For local development the default login is:

- Username: `admin`
- Password: `admin123`

Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` environment variables before starting the server to use your own credentials.

The admin dashboard supports viewing orders, updating delivery status, and adding or editing menu products. Product changes are saved to `data/products.json` and remain after the server restarts.
