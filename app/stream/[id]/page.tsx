import StreamPageClient from './StreamPageClient';

export default async function StreamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StreamPageClient id={id} />;
}

// Generate static params for known streams
export async function generateStaticParams() {
  return [
    { id: 'plum-list' },
    { id: 'duckduckgoose' },
    { id: 'bedtime-with-ember' },
    { id: 'quacked-concierge-peak-glow-up' },
    { id: 'offkey' },
    { id: 'starringyou' },
    { id: 'bureau' },
  ];
}
