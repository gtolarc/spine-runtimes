/******************************************************************************
 * Spine Runtimes License Agreement
 * Last updated May 1, 2019. Replaces all prior versions.
 *
 * Copyright (c) 2013-2019, Esoteric Software LLC
 *
 * Integration of the Spine Runtimes into software or otherwise creating
 * derivative works of the Spine Runtimes is permitted under the terms and
 * conditions of Section 2 of the Spine Editor License Agreement:
 * http://esotericsoftware.com/spine-editor-license
 *
 * Otherwise, it is permitted to integrate the Spine Runtimes into software
 * or otherwise create derivative works of the Spine Runtimes (collectively,
 * "Products"), provided that each user of the Products must obtain their own
 * Spine Editor license and redistribution of the Products in any form must
 * include this license and copyright notice.
 *
 * THIS SOFTWARE IS PROVIDED BY ESOTERIC SOFTWARE LLC "AS IS" AND ANY EXPRESS
 * OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
 * OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN
 * NO EVENT SHALL ESOTERIC SOFTWARE LLC BE LIABLE FOR ANY DIRECT, INDIRECT,
 * INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,
 * BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES, BUSINESS
 * INTERRUPTION, OR LOSS OF USE, DATA, OR PROFITS) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 * NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 * EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *****************************************************************************/

module spine.babylonjs {
  export class MeshBatcher extends BABYLON.Mesh {
    depth: number = 0;
    private static VERTEX_SIZE = 9;
    private verticesLength = 0;
    private indicesLength = 0;
    private maxVerticesLength = 0;
    private maxIndicesLength = 0;
    private vdPositions: number[];
    private vdIndices: number[];
    private vdColors: number[];
    private vdUvs: number[];

    constructor(name: string, scene: BABYLON.Scene, maxVertices: number = 10920) {
      super(name, scene);
      if (maxVertices > 10920)
        throw new Error("Can't have more than 10920 triangles per batch: " + maxVertices);
      this.maxVerticesLength =
        maxVertices * MeshBatcher.VERTEX_SIZE * Float32Array.BYTES_PER_ELEMENT;
      this.maxIndicesLength = maxVertices * 3 * Uint16Array.BYTES_PER_ELEMENT;
      this.vdPositions = [];
      this.vdIndices = [];
      this.vdColors = [];
      this.vdUvs = [];
      this.material = new spine.babylonjs.SkeletonMeshMaterial('shader_' + name, scene);
      this.actionManager = new BABYLON.ActionManager(scene);
    }

    clear() {
      this.vdPositions = [];
      this.vdIndices = [];
      this.vdColors = [];
      this.vdUvs = [];
    }

    begin() {
      this.verticesLength = 0;
      this.indicesLength = 0;
    }

    canBatch(verticesLength: number, indicesLength: number) {
      if (this.verticesLength + verticesLength >= this.maxVerticesLength / 2) return false;
      if (this.indicesLength + indicesLength >= this.maxIndicesLength / 2) return false;
      return true;
    }

    batch(
      vertices: ArrayLike<number>,
      verticesLength: number,
      indices: ArrayLike<number>,
      indicesLength: number,
      z: number = 0,
    ) {
      let indexStart = this.verticesLength / MeshBatcher.VERTEX_SIZE;
      let j = 0;
      for (; j < verticesLength; ) {
        this.vdPositions.push(vertices[j++]);
        this.vdPositions.push(vertices[j++]);
        this.vdPositions.push(z);
        this.vdColors.push(vertices[j++]);
        this.vdColors.push(vertices[j++]);
        this.vdColors.push(vertices[j++]);
        this.vdColors.push(vertices[j++]);
        this.vdUvs.push(vertices[j++]);
        this.vdUvs.push(vertices[j++]);
        this.verticesLength += MeshBatcher.VERTEX_SIZE;
      }
      for (j = 0; j < indicesLength; j++) this.vdIndices.push(indices[j] + indexStart);
      this.indicesLength += indicesLength;
      this.alphaIndex = Math.abs(z) * 10 + this.depth * 1000;
    }

    end() {
      let vertexData = new BABYLON.VertexData();
      vertexData.positions = this.vdPositions;
      vertexData.indices = this.vdIndices;
      vertexData.colors = this.vdColors;
      vertexData.uvs = this.vdUvs;
      vertexData.applyToMesh(this, true);
      vertexData = null;
      this.vdPositions = [];
      this.vdIndices = [];
      this.vdColors = [];
      this.vdUvs = [];
    }
  }
}
