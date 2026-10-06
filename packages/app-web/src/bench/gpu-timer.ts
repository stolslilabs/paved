/**
 * GPU time of a span of GL work through EXT_disjoint_timer_query_webgl2, when the browser
 * exposes it. Results arrive a few frames late; `poll()` collects them.
 */
export class GpuTimer {
  readonly available: boolean;
  /** Collected GPU times in milliseconds, in submission order. */
  readonly samples: number[] = [];
  private readonly gl: WebGL2RenderingContext;
  private readonly ext: any;
  private pending: WebGLQuery[] = [];
  private open: WebGLQuery | null = null;

  constructor(gl: WebGL2RenderingContext | WebGLRenderingContext) {
    this.gl = gl as WebGL2RenderingContext;
    this.ext = typeof this.gl.createQuery === "function"
      ? this.gl.getExtension("EXT_disjoint_timer_query_webgl2")
      : null;
    this.available = !!this.ext;
  }

  begin(): void {
    if (!this.ext || this.open || this.pending.length > 8) return;
    const q = this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.open = q;
  }

  end(): void {
    if (!this.ext || !this.open) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.open);
    this.open = null;
  }

  poll(): void {
    if (!this.ext) return;
    const disjoint = this.gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    while (this.pending.length > 0) {
      const q = this.pending[0];
      if (!this.gl.getQueryParameter(q, this.gl.QUERY_RESULT_AVAILABLE)) break;
      this.pending.shift();
      if (!disjoint) {
        this.samples.push(Number(this.gl.getQueryParameter(q, this.gl.QUERY_RESULT)) / 1e6);
      }
      this.gl.deleteQuery(q);
    }
  }
}
