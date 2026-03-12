import Head from 'next/head';
import Dashboard from '../components/Dashboard';

export default function Home() {
  return (
    <div style={{ minHeight: '100vh', background: '#010409' }}>
      <Head>
        <title>ZeroTrust Platform</title>
        <meta name="description" content="ZeroTrust IAM Governance Platform" />
      </Head>
      <Dashboard />
    </div>
  );
}