import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    
    if (!user.workspaceId) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 403 });
    }
    
    const { id: streamId } = await params;
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(streamId)) {
      return NextResponse.json({ error: 'Invalid stream ID format' }, { status: 400 });
    }
    
    // Verify stream belongs to user's workspace and fetch costs from ingest_log
    const data = await withUser(user.id, user.email, async (client) => {
      // Check stream ownership
      const streamCheck = await client.query(
        `SELECT id FROM bureau.streams 
         WHERE id = $1 AND workspace_id = $2`,
        [streamId, user.workspaceId]
      );
      
      if (streamCheck.rows.length === 0) {
        return null; // 404
      }
      
      // Fetch ingest logs for this stream
      const result = await client.query(
        `SELECT 
          il.id,
          il.payload->>'content' as content,
          il.payload->'metadata'->>'cost_usd' as cost_usd,
          il.payload->'metadata' as metadata,
          il.created_at,
          il.status
         FROM bureau.ingest_log il
         WHERE il.workspace_id = $1
         AND il.payload->>'stream_id' IS NOT NULL
         AND il.payload->>'stream_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         AND il.payload->>'stream_id' = $2::text
         ORDER BY il.created_at DESC
         LIMIT 100`,
        [user.workspaceId, streamId]
      );
      
      return result.rows;
    });
    
    if (data === null) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
    }
    
    // Transform logs into output cost format
    // Group by output_id from metadata if present, otherwise create individual entries
    const outputsMap = new Map<string, any>();
    
    data.forEach((row: any) => {
      const metadata = row.metadata || {};
      const outputId = metadata.output_id || row.id;
      const outputName = metadata.output_name || row.content || 'Untitled';
      const outputType = metadata.output_type || 'entry';
      
      const cost = row.cost_usd && row.cost_usd.match(/^[0-9]+\.?[0-9]*$/) 
        ? parseFloat(row.cost_usd) 
        : 0;
      
      if (!outputsMap.has(outputId)) {
        outputsMap.set(outputId, {
          output_id: outputId,
          output_name: outputName,
          output_type: outputType,
          generation_cost_usd: 0,
          failed_renders_cost_usd: 0,
          elevenlabs_characters: metadata.elevenlabs_characters ? parseInt(metadata.elevenlabs_characters) : null,
          elevenlabs_cost_usd: metadata.elevenlabs_cost_usd ? parseFloat(metadata.elevenlabs_cost_usd) : null,
          higgsfield_credits: metadata.higgsfield_credits ? parseFloat(metadata.higgsfield_credits) : null,
          higgsfield_cost_usd: metadata.higgsfield_cost_usd ? parseFloat(metadata.higgsfield_cost_usd) : null,
          views: metadata.views ? parseInt(metadata.views) : null,
          trust_level: metadata.trust_level || 'declared',
          verified_sources: metadata.verified_sources ? (Array.isArray(metadata.verified_sources) ? metadata.verified_sources : [metadata.verified_sources]) : [],
          costPerView: null,
          costPer1kViews: null,
          created_at: row.created_at,
          published_at: metadata.published_at || null,
          lifecycle: metadata.lifecycle || 'published',
          cost_coverage_note: metadata.cost_coverage_note || null,
        });
      }
      
      const output = outputsMap.get(outputId);
      output.generation_cost_usd += cost;
      
      // Calculate per-view metrics if views exist
      if (output.views && output.views > 0) {
        output.costPerView = output.generation_cost_usd / output.views;
        output.costPer1kViews = (output.generation_cost_usd / output.views) * 1000;
      }
    });
    
    const outputs = Array.from(outputsMap.values());
    
    // Calculate summary
    const totalOutputs = outputs.length;
    const totalCost = outputs.reduce((sum, o) => sum + o.generation_cost_usd, 0);
    const totalViews = outputs.reduce((sum, o) => sum + (o.views || 0), 0);
    const avgCostPerView = totalViews > 0 ? totalCost / totalViews : 0;
    const avgCostPer1kViews = totalViews > 0 ? (totalCost / totalViews) * 1000 : 0;
    
    return NextResponse.json({
      stream_id: streamId,
      outputs,
      logs: data, // Keep original logs for reference
      summary: {
        total_outputs: totalOutputs,
        total_cost: totalCost,
        total_views: totalViews,
        avg_cost_per_view: avgCostPerView,
        avg_cost_per_1k_views: avgCostPer1kViews,
      }
    });
    
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Error fetching stream costs:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch costs'
    }, { status: 500 });
  }
}
