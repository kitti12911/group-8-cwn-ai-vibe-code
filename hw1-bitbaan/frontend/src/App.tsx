import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { useTitle } from './components/common';
import { Account } from './pages/Account';
import { Admin } from './pages/Admin';
import { Builder } from './pages/Builder';
import { CartPage } from './pages/Cart';
import { Checkout } from './pages/Checkout';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { OrderPage } from './pages/OrderPage';
import { ProductDetail } from './pages/ProductDetail';
import { Products } from './pages/Products';
import { QuotePage } from './pages/QuotePage';
import { SavedBuild } from './pages/SavedBuild';
import { Warranty } from './pages/Warranty';
import { AuthProvider, ClockProvider } from './state';

function NotFound() {
  useTitle('ไม่พบหน้านี้');
  return (
    <div className="wrap page stack narrow">
      <h1 className="h1">ไม่พบหน้านี้</h1>
      <Link to="/">กลับหน้าแรก</Link>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <ClockProvider>
        <AuthProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="products" element={<Products />} />
              <Route path="products/:sku" element={<ProductDetail />} />
              <Route path="builder" element={<Builder />} />
              <Route path="b/:code" element={<SavedBuild />} />
              <Route path="cart" element={<CartPage />} />
              <Route path="checkout/:orderNo" element={<Checkout />} />
              <Route path="orders/:orderNo" element={<OrderPage />} />
              <Route path="login" element={<Login />} />
              <Route path="account" element={<Account />} />
              <Route path="quotes/:no" element={<QuotePage />} />
              <Route path="admin" element={<Admin />} />
              <Route path="warranty" element={<Warranty />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ClockProvider>
    </BrowserRouter>
  );
}
