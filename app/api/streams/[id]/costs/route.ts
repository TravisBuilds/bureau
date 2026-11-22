import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: streamId } = await params;
    
    // Fetch output costs for this stream
    const costs = await query<{
      output_id: string;
      output_name: string;
      output_type: string;
      generation_cost_usd: number;
      failed_renders_cost_usd: number;
      elevenlabs_characters: number | null;
      elevenlabs_cost_usd: number | null;
      higgsfield_credits: number | null;
      higgsfield_cost_usd: number | null;
      views: number | null;
      watch_time_seconds: number | null;
      subscribers_gained: number | null;
      revenue_usd: number | null;
      trust_level: string;
      verified_sources: string[];
      created_at: Date;
      published_at: Date | null;
      last_synced_at: Date | null;
    }>(
      `SELECT 
        output_id, output_name, output_type,
        generation_cost_usd, failed_renders_cost_usd,
        elevenlabs_characters, elevenlabs_cost_usd,
        higgsfield_credits, higgsfield_cost_usd,
        views, watch_time_seconds, subscribers_gained, revenue_usd,
        trust_level, verified_sources,
        created_at, published_at, last_synced_at
       FROM output_costs
       WHERE stream_id = $1
       ORDER BY created_at DESC`,
      [streamId]
    );
    
    // Calculate totals
    const totalCost = costs.reduce((sum, c) => sum + Number(c.generation_cost_usd), 0);
    const totalViews = costs.reduce((sum, c) => sum + (c.views || 0), 0);
    const avgCostPerView = totalViews > 0 ? totalCost / totalViews : 0;
    
    // Calculate cost per view for each output
    const costsWithMetrics = costs.map(c => ({
      ...c,
      generation_cost_usd: Number(c.generation_cost_usd),
      failed_renders_cost_usd: Number(c.failed_renders_cost_usd),
      elevenlabs_cost_usd: c.elevenlabs_cost_usd ? Number(c.elevenlabs_cost_usd) : null,
      higgsfield_cost_usd: c.higgsfield_cost_usd ? Number(c.higgsfield_cost_usd) : null,
      higgsfield_credits: c.higgsfield_credits ? Number(c.higgsfield_credits) : null,
      revenue_usd: c.revenue_usd ? Number(c.revenue_usd) : null,
      costPerView: c.views && c.views > 0 ? Number(c.generation_cost_usd) / c.views : null,
      costPer1kViews: c.views && c.views > 0 ? (Number(c.generation_cost_usd) / c.views) * 1000 : null,
    }));
    
    return NextResponse.json({
      outputs: costsWithMetrics,
      summary: {
        total_outputs: costs.length,
        total_cost: totalCost,
        total_views: totalViews,
        avg_cost_per_view: avgCostPerView,
        avg_cost_per_1k_views: totalViews > 0 ? (totalCost / totalViews) * 1000 : 0,
      }
    });
    
  } catch (error) {
    console.error('Error fetching costs:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch costs',
      details: String(error)
    }, { status: 500 });
  }
}
