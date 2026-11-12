import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { PointerLockControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/PointerLockControls.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x081018);
scene.fog = new THREE.Fog(0x081018, 18, 55);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.7, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.querySelector("#game").prepend(renderer.domElement);

const controls = new PointerLockControls(camera, document.body);
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const keys = new Set();
const enemies = [];
const enemyHits = [];
const colliders = [];
const startButton = document.querySelector("#start-button");
const message = document.querySelector("#message");
const hitMarker = document.querySelector("#hit-marker");
const healthText = document.querySelector("#health");
const enemiesText = document.querySelector("#enemies");
const ammoText = document.querySelector("#ammo");
const scoreText = document.querySelector("#score");

let health = 100;
let ammo = 12;
let gameRunning = false;
let reloading = false;
let shotCooldown = 0;
let damageCooldown = 0;
let score = 0;

scene.add(new THREE.HemisphereLight(0xb9d8e5, 0x18202a, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(-8, 16, 8);
sun.castShadow = true;
scene.add(sun);

function createBox(size, position, color, collidable = true) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshStandardMaterial({ color, roughness: 0.82 })
  );
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.collidable = collidable;
  scene.add(mesh);
  if (collidable && size[1] > 0.3) colliders.push(mesh);
  return mesh;
}

const floor = createBox([42, 0.2, 42], [0, -0.1, 0], 0x26343a);
floor.userData.collidable = true;
createBox([42, 5, 0.4], [0, 2.5, -21], 0x1a2429);
createBox([42, 5, 0.4], [0, 2.5, 21], 0x1a2429);
createBox([0.4, 5, 42], [-21, 2.5, 0], 0x1a2429);
createBox([0.4, 5, 42], [21, 2.5, 0], 0x1a2429);

for (const [x, z] of [[-8, -5], [7, -4], [-7, 7], [8, 8], [0, -1]]) {
  createBox([3.5, 2.8, 2], [x, 1.4, z], 0x46545a);
  createBox([3.8, 0.08, 2.3], [x, 2.84, z], 0x667277);
}

function createEnemy(position) {
  const enemy = new THREE.Group();
  enemy.position.copy(position);
  enemy.userData.health = 2;
  enemy.userData.speed = 1.1 + Math.random() * 0.35;
  enemy.userData.attackCooldown = 1 + Math.random();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.2, 0.55),
    new THREE.MeshStandardMaterial({ color: 0xb93e4e, roughness: 0.65 })
  );
  body.position.y = 0.9;
  body.castShadow = true;
  body.userData.enemy = enemy;
  enemy.add(body);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.58, 0.58, 0.58),
    new THREE.MeshStandardMaterial({ color: 0xd16c54, roughness: 0.75 })
  );
  head.position.y = 1.8;
  head.castShadow = true;
  head.userData.enemy = enemy;
  enemy.add(head);

  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.12, 0.04),
    new THREE.MeshBasicMaterial({ color: 0xffd36b })
  );
  visor.position.set(0, 1.84, -0.3);
  visor.userData.enemy = enemy;
  enemy.add(visor);

  scene.add(enemy);
  enemies.push(enemy);
  enemyHits.push(body, head);
}

for (const position of [[-12, 0, -12], [12, 0, -10], [-12, 0, 12], [13, 0, 10], [0, 0, -16]]) {
  createEnemy(new THREE.Vector3(...position));
}

function updateHud() {
  healthText.textContent = Math.max(0, Math.ceil(health));
  enemiesText.textContent = enemies.length;
  ammoText.textContent = `${ammo} / 12`;
  scoreText.textContent = score;
}

function showMessage(title, subtitle, buttonText) {
  message.querySelector("h1").textContent = title;
  message.querySelector("p").textContent = subtitle;
  startButton.textContent = buttonText;
  message.classList.remove("hidden");
}

function resetGame() {
  for (const enemy of enemies) scene.remove(enemy);
  enemies.length = 0;
  enemyHits.length = 0;
  for (const position of [[-12, 0, -12], [12, 0, -10], [-12, 0, 12], [13, 0, 10], [0, 0, -16]]) {
    createEnemy(new THREE.Vector3(...position));
  }
  health = 100;
  ammo = 12;
  reloading = false;
  score = 0;
  damageCooldown = 0;
  camera.position.set(0, 1.7, 10);
  updateHud();
}

function isBlocked(position) {
  return colliders.some((collider) => {
    const halfX = collider.geometry.parameters.width / 2 + 0.45;
    const halfZ = collider.geometry.parameters.depth / 2 + 0.45;
    return Math.abs(position.x - collider.position.x) < halfX
      && Math.abs(position.z - collider.position.z) < halfZ;
  });
}

function shoot() {
  if (!gameRunning || reloading || shotCooldown > 0) return;
  if (ammo === 0) {
    reload();
    return;
  }
  ammo -= 1;
  shotCooldown = 0.18;
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hits = raycaster.intersectObjects(enemyHits, false);
  if (hits.length > 0) {
    const enemy = hits[0].object.userData.enemy;
    enemy.userData.health -= 1;
    hitMarker.classList.remove("show");
    void hitMarker.offsetWidth;
    hitMarker.classList.add("show");
    if (enemy.userData.health <= 0) {
      scene.remove(enemy);
      enemies.splice(enemies.indexOf(enemy), 1);
      score += 100;
      for (let i = enemyHits.length - 1; i >= 0; i--) {
        if (enemyHits[i].userData.enemy === enemy) enemyHits.splice(i, 1);
      }
    }
  }
  updateHud();
}

function reload() {
  if (reloading || ammo === 12) return;
  reloading = true;
  setTimeout(() => {
    ammo = 12;
    reloading = false;
    updateHud();
  }, 900);
}

function movePlayer(delta) {
  const speed = 5 * delta;
  const previous = camera.position.clone();
  if (keys.has("KeyW")) controls.moveForward(speed);
  if (keys.has("KeyS")) controls.moveForward(-speed);
  if (keys.has("KeyA")) controls.moveRight(-speed);
  if (keys.has("KeyD")) controls.moveRight(speed);
  camera.position.y = 1.7;
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -19, 19);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -19, 19);
  if (isBlocked(camera.position)) {
    camera.position.x = previous.x;
    camera.position.z = previous.z;
  }
}

function updateEnemies(delta) {
  for (const enemy of enemies) {
    const direction = camera.position.clone().sub(enemy.position);
    direction.y = 0;
    const distance = direction.length();
    enemy.userData.attackCooldown -= delta;
    if (distance > 1.7) {
      enemy.position.add(direction.normalize().multiplyScalar(enemy.userData.speed * delta));
    }
    if (distance <= 12 && enemy.userData.attackCooldown <= 0 && damageCooldown <= 0) {
      enemy.userData.attackCooldown = 1.3 + Math.random() * 0.7;
      health -= 7;
      damageCooldown = 0.35;
      document.body.classList.remove("damaged");
      void document.body.offsetWidth;
      document.body.classList.add("damaged");
      updateHud();
      if (health <= 0) {
        gameRunning = false;
        controls.unlock();
        showMessage("任務失敗", "忍者已被敵人擊倒。", "重新開始");
      }
    } else if (distance <= 1.7 && damageCooldown <= 0) {
      health -= 8;
      damageCooldown = 0.6;
      updateHud();
      if (health <= 0) {
        gameRunning = false;
        controls.unlock();
        showMessage("任務失敗", "忍者已被敵人擊倒。", "重新開始");
      }
    }
    enemy.lookAt(camera.position.x, enemy.position.y, camera.position.z);
  }
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  if (gameRunning && controls.isLocked) {
    shotCooldown = Math.max(0, shotCooldown - delta);
    damageCooldown = Math.max(0, damageCooldown - delta);
    movePlayer(delta);
    updateEnemies(delta);
    if (enemies.length === 0) {
      gameRunning = false;
      controls.unlock();
      showMessage("任務完成", "軍事基地已清空。", "再玩一次");
    }
  }
  renderer.render(scene, camera);
}

startButton.addEventListener("click", () => {
  if (message.querySelector("h1").textContent !== "遊戲暫停") resetGame();
  gameRunning = true;
  message.classList.add("hidden");
  controls.lock();
});
document.addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (event.code === "KeyR") reload();
});
document.addEventListener("keyup", (event) => keys.delete(event.code));
document.addEventListener("mousedown", (event) => {
  if (event.button === 0) shoot();
});
controls.addEventListener("unlock", () => {
  if (gameRunning) showMessage("遊戲暫停", "點擊按鈕返回戰場。", "繼續任務");
});
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

updateHud();
animate();
