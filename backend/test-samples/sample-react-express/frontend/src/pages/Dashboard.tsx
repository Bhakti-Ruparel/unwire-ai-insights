import React, { useEffect, useState } from 'react';
import axios from 'axios';

const API_BASE = 'http://localhost:5000/api';

export default function Dashboard() {
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    axios.get(`${API_BASE}/products`).then(r => setProducts(r.data));
    axios.get(`${API_BASE}/users`).then(r => setUsers(r.data));
  }, []);

  async function handleCreateProduct(data: any) {
    await axios.post(`${API_BASE}/products`, data);
  }

  async function handleDeleteProduct(id: string) {
    await axios.delete(`${API_BASE}/products/${id}`);
  }

  return (
    <div>
      <h1>Dashboard</h1>
      <p>{products.length} products</p>
    </div>
  );
}
