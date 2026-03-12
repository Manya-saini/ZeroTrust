import Head from 'next/head';
import Dashboard from '../components/Dashboard';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-100">
      <Head>
        <title>IAM Governance Dashboard</title>
      </Head>
      <main className="p-8">
        <h1 className="text-3xl font-bold mb-4">IAM Governance Platform</h1>
        <p className="mb-8">Enterprise Identity and Access Management Dashboard</p>
        <Dashboard />
      </main>
    </div>
  );
}
