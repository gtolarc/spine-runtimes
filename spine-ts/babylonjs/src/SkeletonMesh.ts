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
  export class SkeletonMeshMaterial extends BABYLON.ShaderMaterial {
    constructor(name: string, scene: BABYLON.Scene) {
      var route = {
        vertex: 'custom',
        fragment: 'custom',
      };
      var options = {
        attributes: ['position', 'uv', 'color'],
        uniforms: ['worldViewProjection', 'map'],
        needAlphaBlending: true,
        needAlphaTesting: true,
      };
      super(name, scene, route, options);
      this.backFaceCulling = false;
    }
  }

  export class SkeletonMesh extends BABYLON.AbstractMesh {
    tempPos: Vector2 = new Vector2();
    tempUv: Vector2 = new Vector2();
    tempLight = new Color();
    tempDark = new Color();
    spineSkeleton: Skeleton;
    state: any;
    zOffset: number = -0.1;
    vertexEffect: VertexEffect;
    onPickDownObservable = new BABYLON.Observable<any>();
    static QUAD_TRIANGLES = [0, 1, 2, 2, 3, 0];
    static VERTEX_SIZE = 2 + 2 + 4;
    private batches = new Array<MeshBatcher>();
    private nextBatchIndex = 0;
    private clipper: SkeletonClipping = new SkeletonClipping();
    private vertices = Utils.newFloatArray(1024);
    private tempColor = new Color();

    constructor(name: string, scene: BABYLON.Scene, skeletonData: SkeletonData) {
      super(name, scene);
      this.spineSkeleton = new Skeleton(skeletonData);
      let animData = new AnimationStateData(skeletonData);
      this.state = new AnimationState(animData);
      this.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    }

    getClassName(): string {
      return 'SkeletonMesh';
    }

    setDepth(d: number) {
      this.getDescendants().forEach(function(child) {
        (<MeshBatcher>child).depth = d;
      });
    }

    update(deltaTime: number) {
      let state = this.state;
      let skeleton = this.spineSkeleton;
      state.update(deltaTime);
      state.apply(skeleton);
      skeleton.updateWorldTransform();
      this.updateGeometry();
    }

    dispose() {
      for (var i = 0; i < this.batches.length; i++) {
        this.batches[i].dispose();
      }
    }

    private clearBatches() {
      for (var i = 0; i < this.batches.length; i++) {
        this.batches[i].clear();
        this.batches[i].isVisible = false;
      }
      this.nextBatchIndex = 0;
    }

    private nextBatch() {
      if (this.batches.length == this.nextBatchIndex) {
        let batch = new MeshBatcher('batcher_' + Date.now(), this.getScene());
        batch.parent = this;
        let onPickDown = new BABYLON.ExecuteCodeAction(
          BABYLON.ActionManager.OnPickDownTrigger,
          evt => {
            var pickInfo = this.getScene().pick(evt.pointerX, evt.pointerY, mesh => true);
            this.onPickDownObservable.notifyObservers({
              name: this.name,
              pickedPoint: pickInfo.pickedPoint,
            });
          },
        );
        batch.actionManager.registerAction(onPickDown);
        this.batches.push(batch);
        batch.material.freeze();
      }
      let batch = this.batches[this.nextBatchIndex++];
      batch.isVisible = true;
      return batch;
    }

    private updateGeometry() {
      this.clearBatches();
      let tempPos = this.tempPos;
      let tempUv = this.tempUv;
      let tempLight = this.tempLight;
      let tempDark = this.tempDark;
      let clipper = this.clipper;
      let vertices: ArrayLike<number> = this.vertices;
      let triangles: Array<number> = null;
      let uvs: ArrayLike<number> = null;
      let drawOrder = this.spineSkeleton.drawOrder;
      let batch = this.nextBatch();
      batch.begin();
      let z = 0;
      let zOffset = this.zOffset;
      for (let i = 0, n = drawOrder.length; i < n; i++) {
        let vertexSize = clipper.isClipping() ? 2 : SkeletonMesh.VERTEX_SIZE;
        let slot = drawOrder[i];
        let attachment = slot.getAttachment();
        let attachmentColor: Color = null;
        let texture: BabylonJsTexture = null;
        let numFloats = 0;
        if (attachment instanceof RegionAttachment) {
          let region = <RegionAttachment>attachment;
          attachmentColor = region.color;
          vertices = this.vertices;
          numFloats = vertexSize * 4;
          region.computeWorldVertices(slot.bone, vertices, 0, vertexSize);
          triangles = SkeletonMesh.QUAD_TRIANGLES;
          uvs = region.uvs;
          texture = <BabylonJsTexture>(<TextureAtlasRegion>region.region.renderObject).texture;
        } else if (attachment instanceof MeshAttachment) {
          let mesh = <MeshAttachment>attachment;
          attachmentColor = mesh.color;
          vertices = this.vertices;
          numFloats = (mesh.worldVerticesLength >> 1) * vertexSize;
          if (numFloats > vertices.length) {
            vertices = this.vertices = spine.Utils.newFloatArray(numFloats);
          }
          mesh.computeWorldVertices(slot, 0, mesh.worldVerticesLength, vertices, 0, vertexSize);
          triangles = mesh.triangles;
          uvs = mesh.uvs;
          texture = <BabylonJsTexture>(<TextureAtlasRegion>mesh.region.renderObject).texture;
        } else if (attachment instanceof ClippingAttachment) {
          let clip = <ClippingAttachment>attachment;
          clipper.clipStart(slot, clip);
        } else continue;
        if (texture != null) {
          let skeleton = slot.bone.skeleton;
          let skeletonColor = skeleton.color;
          let slotColor = slot.color;
          let alpha = skeletonColor.a * slotColor.a * attachmentColor.a;
          let color = this.tempColor;
          color.set(
            skeletonColor.r * slotColor.r * attachmentColor.r,
            skeletonColor.g * slotColor.g * attachmentColor.g,
            skeletonColor.b * slotColor.b * attachmentColor.b,
            alpha,
          );
          let finalVertices: ArrayLike<number>;
          let finalVerticesLength: number;
          let finalIndices: ArrayLike<number>;
          let finalIndicesLength: number;
          if (clipper.isClipping()) {
            clipper.clipTriangles(
              vertices,
              numFloats,
              triangles,
              triangles.length,
              uvs,
              color,
              null,
              false,
            );
            let clippedVertices = clipper.clippedVertices;
            let clippedTriangles = clipper.clippedTriangles;
            if (this.vertexEffect != null) {
              let vertexEffect = this.vertexEffect;
              let verts = clippedVertices;
              for (let v = 0, n = clippedVertices.length; v < n; v += vertexSize) {
                tempPos.x = verts[v];
                tempPos.y = verts[v + 1];
                tempLight.setFromColor(color);
                tempDark.set(0, 0, 0, 0);
                tempUv.x = verts[v + 6];
                tempUv.y = verts[v + 7];
                vertexEffect.transform(tempPos, tempUv, tempLight, tempDark);
                verts[v] = tempPos.x;
                verts[v + 1] = tempPos.y;
                verts[v + 2] = tempLight.r;
                verts[v + 3] = tempLight.g;
                verts[v + 4] = tempLight.b;
                verts[v + 5] = tempLight.a;
                verts[v + 6] = tempUv.x;
                verts[v + 7] = tempUv.y;
              }
            }
            finalVertices = clippedVertices;
            finalVerticesLength = clippedVertices.length;
            finalIndices = clippedTriangles;
            finalIndicesLength = clippedTriangles.length;
          } else {
            let verts = vertices;
            if (this.vertexEffect != null) {
              let vertexEffect = this.vertexEffect;
              for (let v = 0, u = 0, n = numFloats; v < n; v += vertexSize, u += 2) {
                tempPos.x = verts[v];
                tempPos.y = verts[v + 1];
                tempLight.setFromColor(color);
                tempDark.set(0, 0, 0, 0);
                tempUv.x = uvs[u];
                tempUv.y = uvs[u + 1];
                vertexEffect.transform(tempPos, tempUv, tempLight, tempDark);
                verts[v] = tempPos.x;
                verts[v + 1] = tempPos.y;
                verts[v + 2] = tempLight.r;
                verts[v + 3] = tempLight.g;
                verts[v + 4] = tempLight.b;
                verts[v + 5] = tempLight.a;
                verts[v + 6] = tempUv.x;
                verts[v + 7] = tempUv.y;
              }
            } else {
              for (let v = 2, u = 0, n = numFloats; v < n; v += vertexSize, u += 2) {
                verts[v] = color.r;
                verts[v + 1] = color.g;
                verts[v + 2] = color.b;
                verts[v + 3] = color.a;
                verts[v + 4] = uvs[u];
                verts[v + 5] = uvs[u + 1];
              }
            }
            finalVertices = vertices;
            finalVerticesLength = numFloats;
            finalIndices = triangles;
            finalIndicesLength = triangles.length;
          }
          if (finalVerticesLength == 0 || finalIndicesLength == 0) continue;
          if (!batch.canBatch(finalVerticesLength, finalIndicesLength)) {
            batch.end();
            batch = this.nextBatch();
            batch.begin();
          }
          let batchMaterial = <SkeletonMeshMaterial>batch.material;
          if (batchMaterial.getActiveTextures().length == 0) {
            batchMaterial.setTexture('map', texture.texture);
          }
          if (!batchMaterial.hasTexture(texture.texture)) {
            batch.end();
            batch = this.nextBatch();
            batch.begin();
            batchMaterial = <SkeletonMeshMaterial>batch.material;
            batchMaterial.setTexture('map', texture.texture);
          }
          batch.batch(finalVertices, finalVerticesLength, finalIndices, finalIndicesLength, z);
          z += zOffset;
        }
        clipper.clipEndWithSlot(slot);
      }
      clipper.clipEnd();
      batch.end();
    }
  }
}
