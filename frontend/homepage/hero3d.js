/* ==========================================================================
   MediDiag — hero3d.js  (v2: scattered medical waterflow ecosystem)
   --------------------------------------------------------------------------
   - NO central hero object. The particle field is the anchor.
   - InstancedMesh for performance (thousands of elements, single draw call).
   - Correlated "liquid current" motion: one shared flow field, per-instance
     phase/speed offsets so motion belongs to one current.
   - 3D depth layers (background dust, midground medical shapes, foreground accents).
   - Scroll drives camera + flow intensity (3 chapters, native scroll + lerp).
   - Pointer parallax is subtle and capped.
   - Tiered quality: desktop / tablet / mobile / low-power.
   - WebGL fallback + prefers-reduced-motion honored.
   - No GSAP, no Lenis, no React — vanilla Three.js (already a project dep).
   ========================================================================== */

(function () {
  'use strict';

  if (typeof window === 'undefined') return;

  const canvas = document.getElementById('hero-3d-canvas');
  if (!canvas) return;

  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    canvas.style.display = 'none';
    return;
  }

  function hasWebGL() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext &&
        (c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }
  if (!hasWebGL()) {
    canvas.style.display = 'none';
    return;
  }

  let heroResizeObserver = null;

  loadThree()
    .then(function (THREE) {
      try { initScene(THREE); }
      catch (err) {
        console.error('[hero3d] init failed:', err);
        canvas.style.display = 'none';
      }
    })
    .catch(function (err) {
      console.warn('[hero3d] Three.js not available:', err);
      canvas.style.display = 'none';
    });

  function loadThree() {
    return new Promise(function (resolve, reject) {
      if (window.THREE) return resolve(window.THREE);
      const script = document.createElement('script');
      script.src = '/vendor/three.min.js';
      script.async = true;
      script.onload = function () {
        if (window.THREE) resolve(window.THREE);
        else reject(new Error('Three global missing after load'));
      };
      script.onerror = function () { reject(new Error('Failed to load /vendor/three.min.js')); };
      document.head.appendChild(script);
    });
  }

  // ===========================================================================
  function initScene(THREE) {

    // ---------- Quality tiers ----------
    const W0 = window.innerWidth;
    const tiny  = W0 < 480;
    const small = W0 < 768;
    const lowPower =
      tiny ||
      (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ||
      (navigator.deviceMemory && navigator.deviceMemory <= 4);

    // Confetti density per brief (desktop 800–1500; mobile 30–50% of that).
    const COUNT = lowPower ? 380
               : tiny     ? 520
               : small    ? 780
               :            1200;

    // Depth layers (percentages of COUNT).
    const DUST_RATIO      = 0.86;   // very small atmospheric particles
    const MEDICAL_RATIO   = 0.115;  // small recognizable medical shapes
    const ACCENT_RATIO    = 0.025;  // slightly larger accent elements

    const dpr = lowPower ? 1 : Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2);

    // ---------- Renderer ----------
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !lowPower,
      alpha: true,
      powerPreference: 'high-performance',
      premultipliedAlpha: false,
    });
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    // ---------- Scene ----------
    const scene = new THREE.Scene();
    // Fog color = background mint so distant particles blend naturally.
    scene.fog = new THREE.Fog(0xECFDF5, 12, 34);

    // ---------- Camera ----------
    const camera = new THREE.PerspectiveCamera(
      small ? 60 : 52,
      (canvas.clientWidth || window.innerWidth) /
        Math.max(1, canvas.clientHeight || window.innerHeight),
      0.1, 60
    );
        camera.position.set(0, 0.15, 6.6);
    camera.lookAt(0, 0, 0);

    // ---------- Scroll state (declared early to avoid TDZ) ----------
    let targetProgress = 0;
    let progress = 0;

    function computeTargetProgress() {
      const hero = canvas.closest('.hero-section') || canvas.parentElement;
      if (!hero) return;
      const rect = hero.getBoundingClientRect();
      const heroH = Math.max(1, rect.height);
      const scrolled = Math.max(0, -rect.top);
      targetProgress = Math.min(1, scrolled / (heroH * 0.85));
    }

    // ---------- Sizing ----------
    function resolveHeroSize() {
      const heroEl = canvas.closest('.hero-section') || canvas.parentElement || canvas;
      const rect = heroEl.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width  || window.innerWidth));
      const h = Math.max(1, Math.round(rect.height || window.innerHeight));
      return { w, h };
    }
    function applyRendererSize() {
      const { w, h } = resolveHeroSize();
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    applyRendererSize();
    requestAnimationFrame(function () {
      applyRendererSize();
      requestAnimationFrame(applyRendererSize);
    });

    if (typeof ResizeObserver === 'function') {
      heroResizeObserver = new ResizeObserver(function () {
        applyRendererSize();
        computeTargetProgress();
      });
      const heroEl = canvas.closest('.hero-section') || canvas.parentElement;
      if (heroEl) heroResizeObserver.observe(heroEl);
    }

    // ---------- Lights (soft, crystal-mint) ----------
    scene.add(new THREE.AmbientLight(0xE8FFF6, 1.05));
    const key = new THREE.DirectionalLight(0xFFFFFF, 0.95);
    key.position.set(4, 6, 4);
    scene.add(key);
    const rim = new THREE.PointLight(0x34D399, 0.65, 22);
    rim.position.set(-5, -2, -3);
    scene.add(rim);
    const fill = new THREE.PointLight(0xFFFFFF, 0.35, 18);
    fill.position.set(3, -3, 2);
    scene.add(fill);

    // ==========================================================================
    // SHARED FLOW FIELD
    // ------------------------------------------------------------------------
    // This is the "liquid current." Every particle samples the same field
    // (position-dependent + time-dependent) so motion looks correlated.
    // ==========================================================================
    const FLOW = {
      dir: new THREE.Vector3(1.0, -0.15, 0.35).normalize(), // main drift
      speed: 0.55,
      turbulence: 0.35,
      swirl: 0.18,
    };

    function flowOffset(t, seed, out) {
      // Layered sinusoids produce smooth waterlike motion that is shared
      // but still unique per particle via `seed`.
      const s = seed;
      const sx = Math.sin(t * 0.55 + s * 0.73) * 0.22
               + Math.sin(t * 0.21 + s * 1.41) * 0.35;
      const sy = Math.cos(t * 0.47 + s * 1.10) * 0.18
               + Math.sin(t * 0.19 + s * 0.62) * 0.28;
      const sz = Math.sin(t * 0.33 + s * 0.51) * 0.20;
      out.set(sx, sy, sz);
      return out;
    }

    // ==========================================================================
    // LAYER 1 — Background dust (Points, additive blending, tiny)
    // ==========================================================================
    const dustCount = Math.floor(COUNT * DUST_RATIO);

    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(dustCount * 3);
    const dustSeed = new Float32Array(dustCount);
    const dustSize = new Float32Array(dustCount);
    const dustTint = new Float32Array(dustCount * 3);

    const PALETTE = [
      new THREE.Color(0xFFFFFF).convertSRGBToLinear(),
      new THREE.Color(0xE8FFF6).convertSRGBToLinear(),
      new THREE.Color(0xA7F3D0).convertSRGBToLinear(),
      new THREE.Color(0x6EE7B7).convertSRGBToLinear(),
      new THREE.Color(0x34D399).convertSRGBToLinear(),
    ];

    for (let i = 0; i < dustCount; i++) {
      // Wider depth spread; keep clear of center so hero text stays readable.
      let x = (Math.random() - 0.5) * 20;
      let y = (Math.random() - 0.5) * 11;
      let z = -20 + Math.random() * 20;
      if (Math.abs(x) < 1.6 && Math.abs(y) < 1.1) {
        x += (x >= 0 ? 1 : -1) * (0.5 + Math.random() * 0.6);
        z = -20 + Math.random() * 9;
      }
      dustPos[i * 3 + 0] = x;
      dustPos[i * 3 + 1] = y;
      dustPos[i * 3 + 2] = z;

      dustSeed[i] = Math.random() * Math.PI * 2;
      const r = Math.random();
      dustSize[i] = 0.012 + Math.pow(r, 1.6) * 0.028;

      const c = PALETTE[(Math.random() * PALETTE.length) | 0];
      dustTint[i * 3 + 0] = c.r;
      dustTint[i * 3 + 1] = c.g;
      dustTint[i * 3 + 2] = c.b;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    dustGeo.setAttribute('aSeed',    new THREE.BufferAttribute(dustSeed, 1));
    dustGeo.setAttribute('aSize',    new THREE.BufferAttribute(dustSize, 1));
    dustGeo.setAttribute('aColor',   new THREE.BufferAttribute(dustTint, 3));

    const dustUniforms = {
      uPixelRatio: { value: dpr },
      uTime:       { value: 0 },
      uFlow:       { value: 0 },
      uOpacity:    { value: 0.62 },
    };

    const dustMat = new THREE.ShaderMaterial({
      uniforms: dustUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute float aSize;
        attribute float aSeed;
        attribute vec3  aColor;
        uniform float uPixelRatio;
        uniform float uTime;
        uniform float uFlow;
        varying vec3  vColor;
        varying float vAlpha;

        void main() {
          vColor = aColor;
          vec3 pos = position;

          // Shared liquid flow (matches JS-side flowOffset scale).
          float t = uTime * 0.35;
          pos.x += sin(t * 0.55 + aSeed * 0.73) * 0.22
                 + sin(t * 0.21 + aSeed * 1.41) * 0.35
                 + uFlow * 1.30;
          pos.y += cos(t * 0.47 + aSeed * 1.10) * 0.18
                 + sin(t * 0.19 + aSeed * 0.62) * 0.28
                 + uFlow * 0.42;
          pos.z += sin(t * 0.33 + aSeed * 0.51) * 0.20;

          float depthFactor = clamp((pos.z + 20.0) / 20.0, 0.0, 1.0);
          pos.x += uFlow * depthFactor * 0.7;

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = aSize * uPixelRatio * (280.0 / -mvPosition.z);

          vAlpha = mix(0.30, 1.0, depthFactor);
          vAlpha = clamp(vAlpha, 0.16, 0.95);
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        varying vec3  vColor;
        varying float vAlpha;
        uniform float uOpacity;
        void main() {
          vec2 uv = gl_PointCoord - vec2(0.5);
          float d  = length(uv);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.12, d);
          gl_FragColor = vec4(vColor, a * vAlpha * uOpacity);
        }
      `,
    });

    const dust = new THREE.Points(dustGeo, dustMat);
    dust.frustumCulled = false;
    scene.add(dust);

    // ==========================================================================
    // LAYER 2 — Midground medical shapes (InstancedMesh, real 3D geometry)
    //           Capsules + tablets + small crosses
    // ==========================================================================
    const medicalCount = Math.floor(COUNT * MEDICAL_RATIO);

    // Shared material (soft mint/pearl, low transparency so shapes read as
    // elegant artifacts rather than blobs).
    const medicalMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xE8FFF6,
      roughness: 0.14,
      metalness: 0.0,
      transmission: 0.85,
      thickness: 0.8,
      ior: 1.34,
      clearcoat: 0.7,
      clearcoatRoughness: 0.10,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });

    // Build one merged small capsule geometry (capsule + rounded ends) so we
    // can instance it without paying per-frame cost.
    function makeCapsuleGeo(r, l) {
      const cap = new THREE.CapsuleGeometry(r, l, 6, 10);
      return cap;
    }
    const capsuleGeo = makeCapsuleGeo(0.06, 0.10);

    // Tablet-like cylinder
    const tabletGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.025, 10);

    // Small cross (two thin boxes)
    function makeCrossGeo() {
      const g1 = new THREE.BoxGeometry(0.11, 0.032, 0.032);
      const g2 = new THREE.BoxGeometry(0.032, 0.11, 0.032);
      // Manual merge (BufferGeometryUtils isn't loaded in this bundle)
      const pos1 = g1.attributes.position.array;
      const pos2 = g2.attributes.position.array;
      const norm1 = g1.attributes.normal.array;
      const norm2 = g2.attributes.normal.array;
      const idx1 = g1.index.array;
      const idx2 = g2.index.array;

      const totalPos = new Float32Array(pos1.length + pos2.length);
      totalPos.set(pos1, 0);
      totalPos.set(pos2, pos1.length);
      const totalNorm = new Float32Array(norm1.length + norm2.length);
      totalNorm.set(norm1, 0);
      totalNorm.set(norm2, norm1.length);
      const offset = pos1.length / 3;
      const totalIdx = new Uint16Array(idx1.length + idx2.length);
      totalIdx.set(idx1, 0);
      for (let i = 0; i < idx2.length; i++) totalIdx[idx1.length + i] = idx2[i] + offset;

      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(totalPos, 3));
      g.setAttribute('normal',   new THREE.BufferAttribute(totalNorm, 3));
      g.setIndex(new THREE.BufferAttribute(totalIdx, 1));
      return g;
    }
    const crossGeo = makeCrossGeo();

    // Distribute medicalCount across the 3 geometry types.
    const perType = Math.floor(medicalCount / 3);
    const medicalGeos = [
      { geo: capsuleGeo, count: perType },
      { geo: tabletGeo,  count: perType },
      { geo: crossGeo,   count: perType },
    ];

    // Store per-instance motion data.
    const medicalItems = [];

        // Keep a dedicated list of InstancedMeshes for the update pass.
    const medicalMeshes = [];


    medicalGeos.forEach(function (entry) {
      const inst = new THREE.InstancedMesh(entry.geo, medicalMaterial, entry.count);
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      inst.frustumCulled = false;
      scene.add(inst);

      entry.inst = inst;
      medicalMeshes.push(inst);

      for (let i = 0; i < entry.count; i++) {
        let x = (Math.random() - 0.5) * 16;
        let y = (Math.random() - 0.5) * 9;
        let z = -12 + Math.random() * 13;
        if (Math.abs(x) < 1.8 && Math.abs(y) < 1.2) {
          x += (x >= 0 ? 1 : -1) * (0.6 + Math.random() * 0.9);
        }
        const seed = Math.random() * Math.PI * 2;
        const baseRot = new THREE.Euler(
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          Math.random() * Math.PI
        );
        const scale = 0.7 + Math.random() * 0.9;

        medicalItems.push({
          node: inst,
          idx: i,
          basePos: new THREE.Vector3(x, y, z),
          seed: seed,
          baseRot: baseRot,
          scale: scale,
          spinSpeed: 0.15 + Math.random() * 0.25,
        });
      }
    });

    // ==========================================================================
    // LAYER 3 — Foreground accents (larger mint spheres, very few)
    // ==========================================================================
    const accentCount = Math.max(3, Math.floor(COUNT * ACCENT_RATIO));
    const accentGeo = new THREE.SphereGeometry(0.10, 12, 10);
    const accentMat = new THREE.MeshPhysicalMaterial({
      color: 0x6EE7B7,
      roughness: 0.10,
      metalness: 0.0,
      transmission: 0.92,
      thickness: 0.9,
      ior: 1.34,
      clearcoat: 0.9,
      clearcoatRoughness: 0.06,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    const accentInst = new THREE.InstancedMesh(accentGeo, accentMat, accentCount);
    accentInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    accentInst.frustumCulled = false;
    scene.add(accentInst);

    const accentItems = [];
    for (let i = 0; i < accentCount; i++) {
      const x = (Math.random() - 0.5) * 14;
      const y = (Math.random() - 0.5) * 8;
      const z = -6 + Math.random() * 8;
      accentItems.push({
        node: accentInst,
        idx: i,
        basePos: new THREE.Vector3(x, y, z),
        seed: Math.random() * Math.PI * 2,
        scale: 1.0 + Math.random() * 0.6,
      });
    }

    // ==========================================================================
    // CHAPTERS (WELCOME / DIAGNOSIS / APPOINTMENT)
    // ==========================================================================
    const CHAPTERS = [
      {
        t: 0.00,
        camPos:  [ 0.00,  0.15, 6.60],
        camLook: [ 0.00,  0.00, 0.00],
        flowMul: 1.00,
      },
      {
        t: 0.50,
        camPos:  [ 0.45,  0.28, 6.30],
        camLook: [-0.10,  0.02, 0.00],
        flowMul: 1.35,
      },
      {
        t: 1.00,
        camPos:  [-0.45,  0.20, 6.40],
        camLook: [ 0.10,  0.00, 0.00],
        flowMul: 1.10,
      },
    ];
    const chap = {
      camPos:  [0, 0, 0],
      camLook: [0, 0, 0],
      flowMul: 1,
    };
    function sampleChapters(p, out) {
      let a = CHAPTERS[0], b = CHAPTERS[CHAPTERS.length - 1];
      for (let i = 0; i < CHAPTERS.length - 1; i++) {
        if (p >= CHAPTERS[i].t && p <= CHAPTERS[i + 1].t) {
          a = CHAPTERS[i]; b = CHAPTERS[i + 1]; break;
        }
      }
      const span = Math.max(b.t - a.t, 0.0001);
      const local = Math.min(1, Math.max(0, (p - a.t) / span));
      const e = local * local * (3 - 2 * local);
      for (let i = 0; i < 3; i++) {
        out.camPos[i]  = a.camPos[i]  + (b.camPos[i]  - a.camPos[i])  * e;
        out.camLook[i] = a.camLook[i] + (b.camLook[i] - a.camLook[i]) * e;
      }
      out.flowMul = a.flowMul + (b.flowMul - a.flowMul) * e;
    }

        // ==========================================================================
    // SCROLL (state and computeTargetProgress are declared above)
    // ==========================================================================

    // ==========================================================================
    // POINTER
    const pointer = { x: 0, y: 0 };
    function onPointerMove(e) {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
    }

    function onResize() {
      applyRendererSize();
      computeTargetProgress();
    }

    // ==========================================================================
    // RAF LOOP
    // ==========================================================================
    const clock = new THREE.Clock();
    let rafId = null;
    let stopped = false;
    let elapsed = 0;

    const _camTarget  = new THREE.Vector3();
    const _lookTarget = new THREE.Vector3();

    // Reusable temp objects (avoid per-frame allocation).
    const _m   = new THREE.Matrix4();
    const _q   = new THREE.Quaternion();
    const _p   = new THREE.Vector3();
    const _s   = new THREE.Vector3();
    const _e   = new THREE.Euler();

    function tick() {
      if (stopped) return;
      rafId = requestAnimationFrame(tick);

      const dt = Math.min(0.05, clock.getDelta());
      elapsed += dt;

      progress += (targetProgress - progress) * Math.min(1, dt * 3.5);

      sampleChapters(progress, chap);

      // Uniforms
      const flowScalar = progress * 0.6 * chap.flowMul;
      dustUniforms.uTime.value = elapsed;
      dustUniforms.uFlow.value = flowScalar;

      // Camera
      _camTarget.set(
        chap.camPos[0] + pointer.x * 0.22,
        chap.camPos[1] + pointer.y * 0.14,
        chap.camPos[2]
      );
      camera.position.x += (_camTarget.x - camera.position.x) * Math.min(1, dt * 4);
      camera.position.y += (_camTarget.y - camera.position.y) * Math.min(1, dt * 4);
      camera.position.z += (_camTarget.z - camera.position.z) * Math.min(1, dt * 4);

      _lookTarget.set(
        chap.camLook[0] + pointer.x * 0.06,
        chap.camLook[1] + pointer.y * 0.05,
        chap.camLook[2]
      );
      camera.lookAt(_lookTarget);

      // ---- Update medical instances (real 3D elements) ----
      const t = elapsed;
      for (let i = 0; i < medicalItems.length; i++) {
        const it = medicalItems[i];
        const seed = it.seed;

        // Shared flow (same math as the shader side, scaled for mesh space).
        const flowX = Math.sin(t * 0.55 + seed * 0.73) * 0.22
                    + Math.sin(t * 0.21 + seed * 1.41) * 0.35
                    + flowScalar * 1.30;
        const flowY = Math.cos(t * 0.47 + seed * 1.10) * 0.18
                    + Math.sin(t * 0.19 + seed * 0.62) * 0.28
                    + flowScalar * 0.42;
        const flowZ = Math.sin(t * 0.33 + seed * 0.51) * 0.20;

        _p.set(
          it.basePos.x + flowX,
          it.basePos.y + flowY,
          it.basePos.z + flowZ
        );

        _e.set(
          it.baseRot.x + t * it.spinSpeed * 0.5,
          it.baseRot.y + t * it.spinSpeed * 0.35,
          it.baseRot.z + t * it.spinSpeed * 0.2
        );
        _q.setFromEuler(_e);

        const s = it.scale;
        _s.set(s, s, s);

                _m.compose(_p, _q, _s);
        it.node.setMatrixAt(it.idx, _m);
      }

             // Mark medical instance matrices dirty
      for (let i = 0; i < medicalMeshes.length; i++) {
        medicalMeshes[i].instanceMatrix.needsUpdate = true;
      }

      // ---- Accent instances ----
      for (let i = 0; i < accentItems.length; i++) {
        const it = accentItems[i];
        const seed = it.seed;
        const flowX = Math.sin(t * 0.40 + seed) * 0.35 + flowScalar * 0.9;
        const flowY = Math.cos(t * 0.30 + seed * 1.3) * 0.25 + flowScalar * 0.35;
        const flowZ = Math.sin(t * 0.25 + seed * 0.7) * 0.20;
        _p.set(it.basePos.x + flowX, it.basePos.y + flowY, it.basePos.z + flowZ);
        _q.setFromEuler(_e.set(t * 0.15 + seed, t * 0.20 + seed * 0.5, 0));
        const s = it.scale;
        _s.set(s, s, s);
        _m.compose(_p, _q, _s);
        it.node.setMatrixAt(it.idx, _m);
      }
      accentInst.instanceMatrix.needsUpdate = true;

      renderer.render(scene, camera);
    }

    // ==========================================================================
    // LIFECYCLE
    // ==========================================================================
    window.addEventListener('scroll', computeTargetProgress, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    computeTargetProgress();
    onResize();
    tick();

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      } else if (rafId === null && !stopped) {
        tick();
      }
    });

    window.addEventListener('pagehide', function () {
      stopped = true;
      if (rafId !== null) cancelAnimationFrame(rafId);

      renderer.dispose();
      dustGeo.dispose();
      dustMat.dispose();
      capsuleGeo.dispose();
      tabletGeo.dispose();
      crossGeo.dispose();
      accentGeo.dispose();
      medicalMaterial.dispose();
      accentMat.dispose();

      scene.traverse(function (obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(function (m) { m.dispose(); });
          else obj.material.dispose();
        }
      });

      if (heroResizeObserver) {
        heroResizeObserver.disconnect();
        heroResizeObserver = null;
      }

      window.removeEventListener('scroll', computeTargetProgress);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointerMove);
    });
  }
})();