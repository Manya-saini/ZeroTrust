import React from 'react';

export default function Dashboard() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <section className="bg-white p-6 rounded shadow">
        <h2 className="text-xl font-semibold mb-2">Active Users</h2>
        {/* Chart placeholder */}
      </section>
      <section className="bg-white p-6 rounded shadow">
        <h2 className="text-xl font-semibold mb-2">Privileged Users</h2>
        {/* Chart placeholder */}
      </section>
      <section className="bg-white p-6 rounded shadow">
        <h2 className="text-xl font-semibold mb-2">Access Requests</h2>
        {/* Chart placeholder */}
      </section>
      <section className="bg-white p-6 rounded shadow">
        <h2 className="text-xl font-semibold mb-2">Policy Violations</h2>
        {/* Chart placeholder */}
      </section>
      <section className="bg-white p-6 rounded shadow col-span-1 md:col-span-2">
        <h2 className="text-xl font-semibold mb-2">Risk Scores</h2>
        {/* Chart placeholder */}
      </section>
    </div>
  );
}
