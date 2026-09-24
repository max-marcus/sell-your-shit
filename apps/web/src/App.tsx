import { NavLink, Route, Routes } from 'react-router-dom';
import { InventoryPage } from './pages/InventoryPage';
import { ItemEditorPage } from './pages/ItemEditorPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  return (
    <>
      <nav className="nav">
        <NavLink to="/" className="brand">
          sell your shit
        </NavLink>
        <div className="links">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
            Inventory
          </NavLink>
          <NavLink to="/items/new" className={({ isActive }) => (isActive ? 'active' : '')}>
            Add item
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => (isActive ? 'active' : '')}>
            Settings
          </NavLink>
        </div>
      </nav>
      <main className="container">
        <Routes>
          <Route path="/" element={<InventoryPage />} />
          <Route path="/items/new" element={<ItemEditorPage />} />
          <Route path="/items/:id" element={<ItemEditorPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </>
  );
}
