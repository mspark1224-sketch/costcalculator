// =============================
// 데이터
// =============================
let materials = JSON.parse(localStorage.getItem("materials")) || [];
let quotes = JSON.parse(localStorage.getItem("quotes")) || [];
let products = JSON.parse(localStorage.getItem("products")) || [];
let priceHistory = JSON.parse(localStorage.getItem("priceHistory")) || [];
let productionCostRecords = JSON.parse(localStorage.getItem("productionCostRecords")) || [];
let editingMaterialId = null;
let editingSubMaterialId = null;
let idleTimer = null;
let warningTimer = null;

const IDLE_LIMIT = 10 * 60 * 1000;      // 10분
const WARNING_DURATION = 1 * 60 * 1000; // 1분
// 공통
// =============================
function saveAll() {
  localStorage.setItem("materials", JSON.stringify(materials));
  localStorage.setItem("quotes", JSON.stringify(quotes));
  localStorage.setItem("products", JSON.stringify(products));
  localStorage.setItem("productionCostRecords", JSON.stringify(productionCostRecords));
}

function formatNumber(num) {
  return Number(num || 0).toLocaleString("ko-KR");
}

function formatDiffText(diff) {
  const abs = Math.abs(diff);
  return diff < 0
    ? `- ${formatNumber(abs)}`
    : `+ ${formatNumber(abs)}`;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeJsString(str) {
  return String(str ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'");
}
function isLoggedIn() {
  return sessionStorage.getItem("isLogin") === "true";
}

function startIdleTimer() {
  clearTimeout(idleTimer);
  clearTimeout(warningTimer);

  if (!isLoggedIn()) return;

  idleTimer = setTimeout(() => {
    const keepLogin = confirm("장기간 사용하지 않아 1분 후 로그아웃됩니다.\n로그인을 연장하시겠습니까?");

    if (keepLogin) {
      resetIdleTimer();
      return;
    }

    warningTimer = setTimeout(() => {
      logout();
      alert("장시간 미사용으로 로그아웃되었습니다.");
    }, WARNING_DURATION);
  }, IDLE_LIMIT);
}

function resetIdleTimer() {
  if (!isLoggedIn()) return;
  startIdleTimer();
}

function bindActivityEvents() {
  ["mousemove", "keydown", "click", "scroll", "touchstart"].forEach(eventName => {
    document.addEventListener(eventName, resetIdleTimer);
  });
}
function logout() {
  sessionStorage.removeItem("isLogin");

  clearTimeout(idleTimer);
  clearTimeout(warningTimer);

  document.getElementById("mainPage").style.display = "none";
  document.getElementById("loginPage").style.display = "flex";

  document.querySelectorAll(".page").forEach(p => p.style.display = "none");
}
// =============================
// 페이지 전환
// =============================
window.showPage = function(id) {
  document.querySelectorAll(".page").forEach((p) => {
    p.style.display = "none";
  });

  const target = document.getElementById(id);
  if (target) target.style.display = "block";

  if (id === "db") {
    loadMaterials();
    loadPriceHistory(document.getElementById("priceSearch")?.value || "");
  }


if (id === "recipe") {
  if (typeof window.loadProducts === "function") {
    window.loadProducts();
  }
}

  if (id === "calc") {
    loadCalcProducts();
    loadActualCostRecords();
  }

  if (id === "history") {
    loadQuotes();
  }
}
// =============================
// 제품 목록 불러오기
// =============================
function loadProducts() {
  const tbody = document.getElementById("recipeProductList");
  if (!tbody) return;

  const keyword = (document.getElementById("productSearch")?.value || "").trim().toLowerCase();
  const filtered = products.filter(p =>
    !keyword ||
    String(p.name || "").toLowerCase().includes(keyword) ||
    String(p.type || "").toLowerCase().includes(keyword)
  );

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7">데이터 없음</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  filtered.forEach((p) => {
    const tr = document.createElement("tr");
    const live = calculateLiveProductCosts(p);
    const savedTotal = Number(p.productMaterialCost ?? p.unitCost ?? 0);
    const changed = Math.round(live.productMaterialCost) !== Math.round(savedTotal);
    tr.className = changed ? (live.productMaterialCost > savedTotal ? "cost-up" : "cost-down") : "";

    tr.innerHTML = `
      <td><input type="checkbox" class="rowCheck" value="${p.id}"></td>
      <td>${escapeHtml(p.type || "-")}</td>
      <td class="product-link" onclick="loadProduct(${p.id})">${escapeHtml(p.name)}</td>
      <td class="right">${formatNumber(Math.round(live.rawMaterialCost))}원</td>
      <td class="right">${formatNumber(Math.round(live.subMaterialCost))}원</td>
      <td class="right product-cost-cell">
        ${formatNumber(Math.round(live.productMaterialCost))}원
        ${changed ? `<span class="cost-change">저장 ${formatNumber(Math.round(savedTotal))}원 → 현재 ${formatNumber(Math.round(live.productMaterialCost))}원</span>` : ""}
      </td>
      <td>${new Date(p.date).toLocaleString("ko-KR")}</td>
    `;

    tbody.appendChild(tr);
  });
}
window.searchPriceHistory = function() {
  const keyword = document.getElementById("priceSearch")?.value || "";
  loadPriceHistory(keyword);
}
window.showPriceHistoryByMaterial = function(code, name) {
  const input = document.getElementById("priceSearch");
  if (input) input.value = name;

  loadPriceHistoryByCode(code);
};
function loadPriceHistoryByCode(code) {
  const table = document.getElementById("priceHistoryTable");
  if (!table) return;

  table.innerHTML = "";

  const filtered = priceHistory
    .filter(m => String(m.code).trim() === String(code).trim())
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!filtered.length) {
    table.innerHTML = `<tr><td colspan="4">데이터 없음</td></tr>`;
    return;
  }

  filtered.forEach((m) => {
    table.innerHTML += `
      <tr>
        <td>${m.code}</td>
        <td>${m.name}</td>
        <td>${formatNumber(m.price)} 원</td>
        <td>${m.date}</td>
      </tr>
    `;
  });
}

// =============================
// 날짜 처리
// =============================
function normalizeDate(dateValue) {
  if (!dateValue) return "";
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

// =============================
// 원재료 공통
// =============================
function getLatestRecordByCode(code) {
  const cleanCode = String(code).trim();

  const filtered = materials.filter((m) => 
    String(m.code).trim() === cleanCode
  );

  if (filtered.length === 0) return null;

  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

  return filtered[0];
}
function getAllLatestMaterials() {
  const map = {};

  materials.forEach((m) => {
    const key = String(m.code);

    if (!map[key] || new Date(m.date) > new Date(map[key].date)) {
      map[key] = m;
    }
  });

  return Object.values(map);
}

// =============================
// 입력 초기화
// =============================
function clearMaterialInputs() {
  document.getElementById("materialCode").value = "";
  document.getElementById("materialName").value = "";
  document.getElementById("materialPrice").value = "";
  document.getElementById("materialDate").value = "";

  editingMaterialId = null;
}

// =============================
// 저장
// =============================
function saveMaterial() {
  const code = document.getElementById("materialCode").value.trim();
  const name = document.getElementById("materialName").value.trim();
  const price = Number(document.getElementById("materialPrice").value);
  const date = normalizeDate(document.getElementById("materialDate").value);

  if (!code || !name || date === "") {
    alert("모든 항목 입력");
    return;
  }

  if (editingMaterialId) {
    const target = materials.find(m => m.id === editingMaterialId);

    if (!target) {
      alert("수정할 데이터를 찾을 수 없습니다.");
      editingMaterialId = null;
      return;
    }

    target.code = code;
    target.name = name;
    target.price = price;
    target.date = date;
  } else {
    const existing = materials.find(m => m.code === code && m.name === name);

    if (existing) {
      const ok = confirm("동일한 원재료가 있습니다. 덮어쓰겠습니까?");
      if (!ok) return;

      existing.price = price;
      existing.date = date;
    } else {
      materials.push({
        id: Date.now(),
        code,
        name,
        price,
        date
      });
    }
  }

  priceHistory.push({
    id: Date.now(),
    code,
    name,
    price,
    date
  });

  editingMaterialId = null;
  saveAll();
  loadMaterials();
  loadPriceHistory("");
  clearMaterialInputs();
}




function handleExcelUpload() {
  const fileInput = document.getElementById("excelFile");
  const file = fileInput.files[0];

  if (!file) {
    alert("엑셀 파일을 선택해주세요.");
    return;
  }

  const reader = new FileReader();

  reader.onload = function (e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (!rows.length) {
      alert("엑셀 데이터가 없습니다.");
      return;
    }

 rows.forEach((row) => {
  const code = String(row["코드"] || "").trim();
  const name = String(row["이름"] || "").trim();

  const rawPrice = row["단가"] || "0";

  // 🔥 수정 핵심
  const price = parseFloat(
    String(rawPrice).replace(/[^\d.]/g, "")
  ) || 0;

  const date = new Date().toISOString().slice(0, 10);

  if (!code || !name) return;

  materials.push({
    id: Date.now() + Math.random(),
    code,
    name,
    price,
    date
  });
});

    saveAll();
    loadMaterials();
    loadPriceHistory("");

    fileInput.value = "";
    alert("엑셀 업로드가 완료되었습니다.");
  };

  reader.readAsArrayBuffer(file);
}


// =============================
// 원가 계산
// =============================
window.updateUnitCost = function () {
  updateRecipeCalc();
};

window.saveRecipe = function () {
  const name = document.getElementById("productName")?.value.trim();
  const type = document.getElementById("productType")?.value || "일반";

  if (!name) {
    alert("제품명을 입력하세요");
    return;
  }
  const volume = parseFloat(document.getElementById("productVolume")?.value) || 0;
  const unit = document.getElementById("productUnit")?.value || "g";
  const density = parseFloat(document.getElementById("productDensity")?.value) || 1;

  if (volume <= 0) {
    alert("제품 내용량을 입력하세요.");
    return;
  }

  const recipe = [];
  document.querySelectorAll("#recipeTable tbody tr").forEach(row => {
    const code = row.querySelector(".code")?.textContent.trim() || "";
    const price = parseFloat(row.querySelector(".price")?.dataset.price) || 0;
    const ratio = parseFloat(row.querySelector(".ratio-input")?.value) || 0;
    const materialName = row.querySelector(".material-input")?.value.trim() || "";
    if (code && ratio > 0) recipe.push({
      materialCode: code,
      materialName,
      code,
      price,
      ratio,
      cost: price * ratio / 100
    });
  });

  const subRecipe = [];
  document.querySelectorAll("#subRecipeTable tbody tr").forEach(row => {
    const code = row.querySelector(".code")?.textContent.trim() || "";
    const price = parseFloat(row.querySelector(".price")?.dataset.price) || 0;
    const ratio = parseFloat(row.querySelector(".ratio-input")?.value) || 0;
    const materialName = row.querySelector(".material-input")?.value.trim() || "";
    if (code && ratio > 0) subRecipe.push({
      materialCode: code,
      materialName,
      code,
      price,
      ratio,
      cost: price * ratio
    });
  });

  if (!recipe.length) {
    alert("원재료를 1개 이상 추가하세요.");
    return;
  }

  const ratioTotal = recipe.reduce((sum, item) => sum + Number(item.ratio || 0), 0);
  if (Math.abs(ratioTotal - 100) > 0.01 && !confirm(`원재료 배합비 합계가 ${ratioTotal.toFixed(1)}%입니다. 그대로 저장할까요?`)) return;

  const materialLossRate = readPercent("materialLossRate");
  const subMaterialLossRate = readPercent("subMaterialLossRate");
  const calculated = calculateFormCosts({ recipe, subRecipe, volume, unit, density, materialLossRate, subMaterialLossRate });

  const existingIndex = products.findIndex(p => p.name === name);
  const existingId = existingIndex >= 0 ? products[existingIndex].id : Date.now();
  if (existingIndex >= 0 && !confirm("이미 동일한 제품이 있습니다. 덮어쓰시겠습니까?")) return;

const newProduct = {
  id: existingId,
  type,
  name,
  costPerKg: calculated.rawCostPerKg,
  rawMaterialBaseCost: calculated.rawBaseEa,
  subMaterialBaseCost: calculated.subBaseEa,
  rawMaterialCost: calculated.rawLossEa,
  subMaterialCost: calculated.subLossEa,
  productMaterialCost: calculated.productMaterialCost,
  unitCost: calculated.productMaterialCost,
  materialLossRate,
  subMaterialLossRate,
  volume,
  unit,
  density,
  recipe,
  subRecipe,
  lastUpdated: new Date().toISOString(),  // 🔥 이 줄 추가
  date: new Date().toISOString()
};

  if (existingIndex >= 0) products.splice(existingIndex, 1, newProduct);
  else products.push(newProduct);
  saveAll();
  loadProducts();
  resetRecipeTable();
  alert("제품 재료비가 저장되었습니다.");
};

// =============================
// 목록
// =============================
function loadMaterials() {
  const list = document.getElementById("materialList");
  const keyword = (document.getElementById("materialSearch")?.value || "").toLowerCase();

  list.innerHTML = "";

  const data = getAllLatestMaterials().filter(
    (m) =>
      m.name.toLowerCase().includes(keyword) ||
      String(m.code).toLowerCase().includes(keyword)
  );

  if (!data.length) {
    list.innerHTML = `<tr><td colspan="7">데이터 없음</td></tr>`;
    return;
  }

 data.forEach((m, i) => {
  list.innerHTML += `
    <tr>
      <td>${i + 1}</td>
      <td>${m.code}</td>
      <td
  style="cursor:pointer; color:#2563eb; font-weight:500;"
  onclick="showPriceHistoryByMaterial('${m.code}', '${m.name}')"
>
  ${m.name}
</td>
      <td>${formatNumber(m.price)} 원</td>
      <td>${m.date}</td>
      <td><button onclick="editMaterial('${m.code}')">수정</button></td>
      <td><button onclick="deleteMaterial('${m.code}')">삭제</button></td>
    </tr>
  `;
});
}

// =============================
// 삭제
// =============================
window.deleteMaterial = function(code) {
  if (!confirm("삭제하시겠습니까?")) return;
  materials = materials.filter((m) => m.code !== code);
  saveAll();
  loadMaterials();
}
window.editMaterial = function(code) {
  const material = materials.find(m => String(m.code) === String(code));
  if (!material) return;

  document.getElementById("materialCode").value = material.code;
  document.getElementById("materialName").value = material.name;
  document.getElementById("materialPrice").value = material.price;
  document.getElementById("materialDate").value = material.date;

  // 수정 중인 항목 id만 기억
  editingMaterialId = material.id;
}
window.loadProduct = function(id) {
  const product = products.find(p => Number(p.id) === Number(id));
  if (!product) return;

  document.getElementById("productName").value = product.name || "";
  document.getElementById("productType").value = product.type || "";
  // 🔥 이 2줄 추가
  document.getElementById("productVolume").value = product.volume || 0;
  document.getElementById("productUnit").value = product.unit || "g";
  document.getElementById("productDensity").value = product.density || 1;
  document.getElementById("materialLossRate").value = product.materialLossRate || 0;
  document.getElementById("subMaterialLossRate").value = product.subMaterialLossRate || 0;

  const tbody = document.querySelector("#recipeTable tbody");
  tbody.innerHTML = "";

  (product.recipe || []).forEach(item => {
    const latest = getLatestRecordByCode(item.code);
    tbody.appendChild(createCompositionRow("raw", {
      name: item.materialName || latest?.name || "",
      code: item.code || "",
      price: latest?.price ?? item.price ?? 0,
      ratio: item.ratio || 0
    }));
  });

  const subTbody = document.querySelector("#subRecipeTable tbody");
  subTbody.innerHTML = "";
  (product.subRecipe || []).forEach(item => {
    const latest = getLatestSubMaterialByCode(item.code);
    subTbody.appendChild(createCompositionRow("sub", {
      name: item.materialName || latest?.name || "",
      code: item.code || "",
      price: latest?.price ?? item.price ?? 0,
      ratio: item.ratio || 0
    }));
  });

  updateRecipeCalc();
}
window.resetRawRecipeTable = function () {
  const tbody = document.querySelector("#recipeTable tbody");
  if (tbody) tbody.innerHTML = "";
  document.getElementById("materialLossRate").value = "0";
  updateRecipeCalc();
};

window.resetSubRecipeTable = function () {
  const tbody = document.querySelector("#subRecipeTable tbody");
  if (tbody) tbody.innerHTML = "";
  document.getElementById("subMaterialLossRate").value = "0";
  updateSubRecipeCalc();
};

window.resetRecipeTable = function () {
  resetRawRecipeTable();
  resetSubRecipeTable();

  document.getElementById("productVolume").value = "";
  document.getElementById("productUnit").value = "g";
  document.getElementById("productDensity").value = "1";
  document.getElementById("productName").value = "";
  document.getElementById("productType").value = "";

  updateProductMaterialCost();
};

// =============================
// 히스토리
// =============================
function loadPriceHistory(keyword = "") {
  const table = document.getElementById("priceHistoryTable");
  if (!table) return;

  table.innerHTML = "";

  const search = String(keyword).trim().toLowerCase();

  let filtered = priceHistory;

  // 검색어가 있으면 이름/코드 부분검색
  if (search) {
    filtered = priceHistory.filter(m =>
      String(m.code || "").toLowerCase().includes(search) ||
      String(m.name || "").toLowerCase().includes(search)
    );
  }

  // 최신순 정렬
  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
if (!filtered.length) {
  table.innerHTML = `<tr><td colspan="4">데이터 없음</td></tr>`;
  return;
}

filtered.forEach((m) => {
  table.innerHTML += `
    <tr>
      <td>${m.code}</td>
      <td>${m.name}</td>
      <td>${formatNumber(m.price)} 원</td>
      <td>${m.date}</td>
    </tr>
  `;
});

  
}

function deletePriceHistory(id) {
  priceHistory = priceHistory.filter((m) => m.id !== id);
  saveAll();
  loadPriceHistory(document.getElementById("priceSearch")?.value || "");
}
// =============================
// 실시간 원가 계산 (🔥 여기 추가) 0319
// =============================
function calculateLiveCost(product) {
  let total = 0;

  product.recipe.forEach(item => {
    const latest = getLatestRecordByCode(item.code);

    if (!latest) return;

    const price = latest.price;
    const ratio = item.ratio;

    total += price * (ratio / 100);
  });

  return Math.round(total);
}


// =============================
// 배합표 - 원재료 추가
// =============================
function addRecipe() {
  const tbody = document.querySelector("#recipeTable tbody");
  const materials = getAllLatestMaterials();

  // 🔥 이름 기준으로 변경
  const options = materials.map(m => 
    `<option value="${m.name}"></option>`
  ).join("");

  const row = document.createElement("tr");

  row.innerHTML = `
    <td>
      <input 
        list="materialListOptions" 
        oninput="updateRecipeRow(this)" 
        placeholder="원재료명 입력" 
      />
      <datalist id="materialListOptions">
        ${options}
      </datalist>
    </td>

    <td class="code"></td>
    <td class="price" data-price="0">0</td>

    <td>
      <input type="number" value="0" oninput="updateRecipeCalc()" />
    </td>

    <td class="cost">0</td>

    <td>
      <button onclick="this.closest('tr').remove(); updateRecipeCalc();">삭제</button>
    </td>
  `;

  tbody.appendChild(row);
}
// =============================
// 선택 시 자동 입력
// =============================
function updateRecipeRow(input) {
  const value = input.value.trim();
  const row = input.closest("tr");

  const materials = getAllLatestMaterials();

  // 🔥 이름 기준 매칭
  const material = materials.find(m => m.name === value);

  if (!material) {
    row.querySelector(".code").innerText = "";
    row.querySelector(".price").innerText = "0";
    row.querySelector(".price").dataset.price = "0";
    row.querySelector(".cost").innerText = "0";
    updateRecipeCalc();
    return;
  }

  // 🔥 내부 값 세팅
  row.querySelector(".code").innerText = material.code;

  row.querySelector(".price").innerText = formatNumber(material.price);
  row.querySelector(".price").dataset.price = material.price;

  updateRecipeCalc();
}
// =============================
// 계산
// =============================
function updateRecipeCalc() {
  let totalRatio = 0;
  let totalCost = 0;

  document.querySelectorAll("#recipeTable tbody tr").forEach(row => {
    const price = parseFloat(row.querySelector(".price")?.dataset.price) || 0;
    const ratio = parseFloat(row.querySelector("td:nth-child(4) input")?.value) || 0;

    const cost = price * (ratio / 100);

    row.querySelector(".cost").innerText = formatNumber(Math.round(cost));

    totalRatio += ratio;
    totalCost += cost;
  });

  document.getElementById("ratioSum").innerText = totalRatio.toFixed(1);
  document.getElementById("materialCostSum").innerText = formatNumber(Math.round(totalCost));

  updateUnitCost();
}
function deleteProduct(id) {
  const ok = confirm("이 제품을 삭제할까요?");
  if (!ok) return;

  products = products.filter((p) => p.id !== id);
  saveAll();
  loadProducts();
}
function sanitizeSheetName(name) {
  return String(name || "배합표")
    .replace(/[\\/*?:[\]]/g, "")
    .slice(0, 31);
}

async function downloadStyledRecipeExcel(product, recipeRows) {
  // product 예시:
  // {
  //   name: "오늘은조퇴",
  //   type: "가공치즈",
  //   savedAt: "2026-04-03 10:09:52",
  //   savedCost: 4800,
  //   unitCost: 14400
  // }

  // recipeRows 예시:
  // [
  //   {
  //     materialName: "테스트10",
  //     code: "1",
  //     savedPrice: 4000,
  //     latestPrice: 8000,
  //     ratio: 40,
  //     savedCost: 1600,
  //     latestCost: 3200,
  //     diff: 4000,
  //     increaseDate: "2026-04-03"
  //   }
  // ]

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(`${product.name} 배합표`, {
    views: [{ state: "frozen", ySplit: 9 }]
  });

  // 열 너비
  ws.columns = [
    { width: 6 },   // A No
    { width: 20 },  // B 원재료
    { width: 10 },  // C 코드
    { width: 12 },  // D 저장단가
    { width: 12 },  // E 최신단가
    { width: 12 },  // F 배합비
    { width: 12 },  // G 저장원가
    { width: 12 },  // H 최신원가
    { width: 12 },  // I 변동
    { width: 14 }   // J 인상일
  ];

  const borderThin = {
    top: { style: "thin", color: { argb: "FFD9D9D9" } },
    left: { style: "thin", color: { argb: "FFD9D9D9" } },
    bottom: { style: "thin", color: { argb: "FFD9D9D9" } },
    right: { style: "thin", color: { argb: "FFD9D9D9" } }
  };

  const titleFill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F4E78" }
  };

  const headerFill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF2F75B5" }
  };

  const labelFill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF2F2F2" }
  };

  const totalFill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEAF3FF" }
  };

  const changedFill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFF2CC" }
  };

  // 제목
  ws.mergeCells("A1:J1");
  ws.getCell("A1").value = `${product.name} 배합표`;
  ws.getCell("A1").font = {
    bold: true,
    size: 16,
    color: { argb: "FFFFFFFF" }
  };
  ws.getCell("A1").alignment = {
    horizontal: "center",
    vertical: "middle"
  };
  ws.getCell("A1").fill = titleFill;
  ws.getCell("A1").border = borderThin;
  ws.getRow(1).height = 26;

  // 상단 정보
  const metaRows = [
    ["제품명", product.name],
    ["유형", product.type],
    ["저장일", product.savedAt],
    ["저장 원가", product.savedCost],
    ["단위원가", product.unitCost]
  ];

  metaRows.forEach((item, idx) => {
    const rowNum = 3 + idx;

    ws.getCell(`A${rowNum}`).value = item[0];
    ws.getCell(`A${rowNum}`).fill = labelFill;
    ws.getCell(`A${rowNum}`).font = { bold: true };
    ws.getCell(`A${rowNum}`).border = borderThin;
    ws.getCell(`A${rowNum}`).alignment = {
      vertical: "middle",
      horizontal: "center"
    };

    ws.getCell(`B${rowNum}`).value = item[1];
    ws.getCell(`B${rowNum}`).border = borderThin;
    ws.getCell(`B${rowNum}`).alignment = {
      vertical: "middle",
      horizontal: rowNum >= 6 ? "right" : "left"
    };
  });

  ws.getCell("B6").numFmt = "#,##0";
  ws.getCell("B7").numFmt = "#,##0";

  // 헤더
  const headerRow = 9;
  const headers = [
    "No", "원재료", "코드", "저장단가", "최신단가",
    "배합비(%)", "저장원가", "최신원가", "변동", "인상일"
  ];

  headers.forEach((text, i) => {
    const cell = ws.getCell(headerRow, i + 1);
    cell.value = text;
    cell.fill = headerFill;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = borderThin;
  });

  ws.getRow(headerRow).height = 22;
  ws.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: headerRow, column: 10 }
  };

  // 데이터
  recipeRows.forEach((item, idx) => {
    const rowNum = headerRow + 1 + idx;

    const values = [
      idx + 1,
      item.materialName,
      item.code,
      item.savedPrice,
      item.latestPrice,
      item.ratio,
      item.savedCost,
      item.latestCost,
      item.diff,
      item.increaseDate || ""
    ];

    values.forEach((value, colIdx) => {
      const cell = ws.getCell(rowNum, colIdx + 1);
      cell.value = value;
      cell.border = borderThin;
      cell.alignment = {
        vertical: "middle",
        horizontal: [1, 3].includes(colIdx + 1) ? "center"
          : [2].includes(colIdx + 1) ? "left"
          : "right"
      };
    });

    // 숫자 포맷
    ["D", "E", "G", "H", "I"].forEach(col => {
      ws.getCell(`${col}${rowNum}`).numFmt = '#,##0;[Red](#,##0)';
    });
    ws.getCell(`F${rowNum}`).numFmt = '0.0';
    ws.getCell(`J${rowNum}`).numFmt = 'yyyy-mm-dd';

    // 변동 강조
    if (Number(item.savedPrice) !== Number(item.latestPrice)) {
      ["E", "H", "I", "J"].forEach(col => {
        ws.getCell(`${col}${rowNum}`).fill = changedFill;
      });
      ws.getCell(`I${rowNum}`).font = {
        bold: true,
        color: { argb: "FFC00000" }
      };
    }
  });

  // 합계
  const totalRow = headerRow + recipeRows.length + 2;

  ws.mergeCells(`A${totalRow}:E${totalRow}`);
  ws.getCell(`A${totalRow}`).value = "합계";
  ws.getCell(`A${totalRow}`).font = { bold: true };
  ws.getCell(`A${totalRow}`).fill = totalFill;
  ws.getCell(`A${totalRow}`).alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell(`A${totalRow}`).border = borderThin;

  ["F", "G", "H"].forEach(col => {
    ws.getCell(`${col}${totalRow}`).fill = totalFill;
    ws.getCell(`${col}${totalRow}`).font = { bold: true };
    ws.getCell(`${col}${totalRow}`).border = borderThin;
  });

  ws.getCell(`F${totalRow}`).value = {
    formula: `SUM(F${headerRow + 1}:F${headerRow + recipeRows.length})`
  };
  ws.getCell(`G${totalRow}`).value = {
    formula: `SUM(G${headerRow + 1}:G${headerRow + recipeRows.length})`
  };
  ws.getCell(`H${totalRow}`).value = {
    formula: `SUM(H${headerRow + 1}:H${headerRow + recipeRows.length})`
  };

  ws.getCell(`F${totalRow}`).numFmt = "0.0";
  ws.getCell(`G${totalRow}`).numFmt = "#,##0";
  ws.getCell(`H${totalRow}`).numFmt = "#,##0";

  // 단위원가
  const unitRow = totalRow + 1;
  ws.mergeCells(`A${unitRow}:G${unitRow}`);
  ws.getCell(`A${unitRow}`).value = "단위원가";
  ws.getCell(`A${unitRow}`).font = { bold: true };
  ws.getCell(`A${unitRow}`).fill = totalFill;
  ws.getCell(`A${unitRow}`).alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell(`A${unitRow}`).border = borderThin;

  ws.getCell(`H${unitRow}`).value = product.unitCost;
  ws.getCell(`H${unitRow}`).numFmt = "#,##0";
  ws.getCell(`H${unitRow}`).font = { bold: true };
  ws.getCell(`H${unitRow}`).fill = totalFill;
  ws.getCell(`H${unitRow}`).border = borderThin;
  ws.getCell(`H${unitRow}`).alignment = { horizontal: "right", vertical: "middle" };

  // 다운로드
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob(
    [buffer],
    { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${product.name}_배합표.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

 

// =============================
// 초기 실행
// =============================
loadMaterials();
loadPriceHistory();
function loadCalcProducts() {
  const select = document.getElementById("calcProductSelect");
  if (!select) return;

  select.innerHTML = `<option value="">선택</option>`;

  products.forEach(p => {
    select.innerHTML += `
      <option value="${p.id}">
        ${p.name}
      </option>
    `;
  });
}
window.loadMaterialCostFromProduct = function () {
  const select = document.getElementById("calcProductSelect");
  const productId = select.value;

  if (!productId) return;

  const product = products.find(p => String(p.id) === String(productId));
  if (!product) return;

  const liveMaterialCost = calculateLiveCost(product);
  document.getElementById("materialCostInput").value = liveMaterialCost || product.costPerKg || 0;
  document.getElementById("calcProductName").innerText = product.name || "-";
};

function getNumberValue(id) {
  return parseFloat(document.getElementById(id)?.value) || 0;
}

function calculateActualCost(showAlert = true) {
  const productId = document.getElementById("calcProductSelect")?.value || "";
  const product = products.find(p => String(p.id) === String(productId));

  if (!product) {
    if (showAlert) alert("제품을 선택하세요.");
    return null;
  }

  const materialCost = getNumberValue("materialCostInput");
  const materialLossRate = getNumberValue("materialLossRate");
  const subMaterialCost = getNumberValue("subMaterialCostInput");
  const subMaterialLossRate = getNumberValue("subMaterialLossRate");
  const packagingCost = getNumberValue("packagingCostInput");
  const workerCount = getNumberValue("workerCount");
  const workHours = getNumberValue("workHours");
  const hourlyLaborCost = getNumberValue("hourlyLaborCost");
  const lineHours = getNumberValue("lineHours");
  const hourlyMfgCost = getNumberValue("hourlyMfgCost");
  const actualInputKg = getNumberValue("actualInputKg");
  const goodOutputKg = getNumberValue("goodOutputKg");
  const logisticsCost = getNumberValue("logisticsCostInput");
  const otherCost = getNumberValue("otherCostInput");
  const marginRate = getNumberValue("marginRate");

  if (materialLossRate >= 100 || subMaterialLossRate >= 100) {
    if (showAlert) alert("원료·부재료 로스율은 100% 미만이어야 합니다.");
    return null;
  }
  if (actualInputKg <= 0 || goodOutputKg <= 0) {
    if (showAlert) alert("실제 투입량과 정상 생산량을 입력하세요.");
    return null;
  }
  if (goodOutputKg > actualInputKg) {
    if (showAlert && !confirm("정상 생산량이 실제 투입량보다 큽니다. 계속 계산할까요?")) return null;
  }
  if (marginRate >= 100) {
    if (showAlert) alert("목표 마진율은 100% 미만이어야 합니다.");
    return null;
  }

  const materialCostWithLoss = materialCost * (1 + materialLossRate / 100);
  const subMaterialCostWithLoss = subMaterialCost * (1 + subMaterialLossRate / 100);
  const totalLaborCost = workerCount * workHours * hourlyLaborCost;
  const totalMfgCost = lineHours * hourlyMfgCost;
  const laborCostPerInputKg = totalLaborCost / actualInputKg;
  const mfgCostPerInputKg = totalMfgCost / actualInputKg;
  const productionCostPerInputKg =
    materialCostWithLoss +
    subMaterialCostWithLoss +
    packagingCost +
    laborCostPerInputKg +
    mfgCostPerInputKg;

  const lineYieldRate = goodOutputKg / actualInputKg;
  const lineLossRate = (1 - lineYieldRate) * 100;
  const normalProductCost = productionCostPerInputKg / lineYieldRate;
  const totalCost = normalProductCost + logisticsCost + otherCost;
  const quotePrice = marginRate > 0 ? totalCost / (1 - marginRate / 100) : totalCost;

  const result = {
    productId,
    productName: product.name,
    materialCost,
    materialLossRate,
    materialCostWithLoss,
    subMaterialCost,
    subMaterialLossRate,
    subMaterialCostWithLoss,
    packagingCost,
    workerCount,
    workHours,
    hourlyLaborCost,
    totalLaborCost,
    laborCostPerInputKg,
    lineHours,
    hourlyMfgCost,
    totalMfgCost,
    mfgCostPerInputKg,
    actualInputKg,
    goodOutputKg,
    lineYieldRate: lineYieldRate * 100,
    lineLossRate,
    productionCostPerInputKg,
    normalProductCost,
    logisticsCost,
    otherCost,
    totalCost,
    marginRate,
    quotePrice
  };

  document.getElementById("calcProductName").innerText = product.name;
  document.getElementById("materialCostText").innerText = formatNumber(Math.round(materialCostWithLoss));
  document.getElementById("subMaterialCostText").innerText = formatNumber(Math.round(subMaterialCostWithLoss));
  document.getElementById("laborCostText").innerText = formatNumber(Math.round(laborCostPerInputKg));
  document.getElementById("mfgCostText").innerText = formatNumber(Math.round(mfgCostPerInputKg));
  document.getElementById("lineYieldText").innerText = lineYieldRate.toFixed(2);
  document.getElementById("productionCostText").innerText = formatNumber(Math.round(productionCostPerInputKg));
  document.getElementById("normalProductCostText").innerText = formatNumber(Math.round(normalProductCost));
  document.getElementById("totalCostText").innerText = formatNumber(Math.round(totalCost));
  document.getElementById("result").innerText = formatNumber(Math.round(quotePrice));

  return result;
}

window.calculateActualCost = calculateActualCost;

window.saveActualCostRecord = function () {
  const batchDate = document.getElementById("batchDate")?.value || "";
  const batchNo = document.getElementById("batchNo")?.value.trim() || "";

  if (!batchDate || !batchNo) {
    alert("생산일과 배치번호를 입력하세요.");
    return;
  }

  const calculated = calculateActualCost();
  if (!calculated) return;

  productionCostRecords.push({
    id: Date.now(),
    batchDate,
    batchNo,
    savedAt: new Date().toISOString(),
    ...calculated
  });

  saveAll();
  loadActualCostRecords();
  alert("배치별 실제원가 raw data가 저장되었습니다.");
};

function loadActualCostRecords() {
  const tbody = document.getElementById("actualCostRecordList");
  if (!tbody) return;

  const keyword = (document.getElementById("actualCostSearch")?.value || "").trim().toLowerCase();
  const filtered = productionCostRecords
    .filter(r =>
      !keyword ||
      String(r.productName || "").toLowerCase().includes(keyword) ||
      String(r.batchNo || "").toLowerCase().includes(keyword)
    )
    .sort((a, b) => new Date(b.savedAt || b.batchDate) - new Date(a.savedAt || a.batchDate));

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="9">저장된 실제원가 데이터가 없습니다.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td>${escapeHtml(r.batchDate)}</td>
      <td>${escapeHtml(r.batchNo)}</td>
      <td>${escapeHtml(r.productName)}</td>
      <td>${formatNumber(r.actualInputKg)} kg</td>
      <td>${formatNumber(r.goodOutputKg)} kg</td>
      <td>${Number(r.lineYieldRate || 0).toFixed(2)}%</td>
      <td>${formatNumber(Math.round(r.totalCost || 0))} 원/kg</td>
      <td>${formatNumber(Math.round(r.quotePrice || 0))} 원/kg</td>
      <td><button type="button" onclick="deleteActualCostRecord(${r.id})">삭제</button></td>
    </tr>
  `).join("");
}

window.loadActualCostRecords = loadActualCostRecords;

window.deleteActualCostRecord = function (id) {
  if (!confirm("이 배치 원가 기록을 삭제할까요?")) return;
  productionCostRecords = productionCostRecords.filter(r => Number(r.id) !== Number(id));
  saveAll();
  loadActualCostRecords();
};

// =============================
// 선택 기능 (견적 조회)
// =============================

function toggleAll(el) {
 document.querySelectorAll("#quoteList .rowCheck").forEach(cb => {
    cb.checked = el.checked;
  });
}

function deleteSelected() {
  const checked = Array.from(document.querySelectorAll("#quoteList .rowCheck:checked"))
    .map(cb => Number(cb.value));

  if (!checked.length) {
    alert("삭제할 항목을 선택하세요.");
    return;
  }

  if (!confirm("선택한 항목을 삭제할까요?")) return;

  quotes = quotes.filter(q => !checked.includes(Number(q.id)));

  saveAll();
  loadQuotes();
}
window.deleteSelectedProducts = function () {
  const checked = Array.from(document.querySelectorAll(".rowCheck:checked"))
    .map(cb => Number(cb.value));

  if (!checked.length) {
    alert("삭제할 제품을 선택하세요.");
    return;
  }

  if (!confirm("선택한 제품을 삭제할까요?")) return;

  products = products.filter(p => !checked.includes(Number(p.id)));

  saveAll();
  loadProducts();
};

function loadSelected() {
  const checked = document.querySelector("#quoteList .rowCheck:checked");

  if (!checked) {
    alert("하나 선택하세요.");
    return;
  }

  loadQuote(checked.value);
}
function loadQuotes() {
  const list = document.getElementById("quoteList");
  list.innerHTML = "";

  if (!quotes || quotes.length === 0) {
    list.innerHTML = `<tr><td colspan="7">데이터 없음</td></tr>`;
    return;
  }

  quotes.forEach((q) => {
    list.innerHTML += `
      <tr>
        <td><input type="checkbox" class="rowCheck" value="${q.id}"></td>
        <td>${q.type || ""}</td>
        <td>${q.name || ""}</td>
        <td>${formatNumber(q.cost)} 원</td>
        <td>${formatNumber(q.unitCost)} 원</td>
        <td>${q.date || ""}</td>
        <td>
        <button type="button" onclick="loadQuote('${q.id}')">불러오기</button>
        </td>
      </tr>
    `;
  });
}
console.log("끝까지 실행됨");
// =============================
// 부재료 데이터
// =============================
let subMaterials = JSON.parse(localStorage.getItem("subMaterials")) || [];

// =============================
// 저장 확장
// =============================
const originalSaveAll = saveAll;
saveAll = function () {
  originalSaveAll();
  localStorage.setItem("subMaterials", JSON.stringify(subMaterials));
  localStorage.setItem("priceHistory", JSON.stringify(priceHistory)); 
};

// =============================
// 페이지 전환 추가
// =============================
const originalShowPage = window.showPage;
window.showPage = function (id) {
  originalShowPage(id);

  if (id === "subDb") {
    loadSubMaterials();
    loadSubPriceHistory(document.getElementById("subPriceSearch")?.value || "");
  }
};

// =============================
// 입력 초기화
// =============================
function clearSubMaterialInputs() {
  document.getElementById("subMaterialCode").value = "";
  document.getElementById("subMaterialName").value = "";
  document.getElementById("subMaterialPrice").value = "";
  document.getElementById("subMaterialDate").value = "";
  editingSubMaterialId = null;
}

// =============================
// 저장
// =============================
function saveSubMaterial() {
  const code = document.getElementById("subMaterialCode").value.trim();
  const name = document.getElementById("subMaterialName").value.trim();
  const price = Number(document.getElementById("subMaterialPrice").value);
  const date = normalizeDate(document.getElementById("subMaterialDate").value);

  if (!code || !name || date === "") {
    alert("모든 항목 입력");
    return;
  }
  const existsName = subMaterials.some(m =>
    m.id !== editingSubMaterialId && m.name.trim().toLowerCase() === name.toLowerCase()
  );

  if (existsName) {
    alert("같은 부재료명이 이미 존재합니다!");
    return;
  }

  // 🔥 코드 중복 체크
  const existsCode = subMaterials.some(m =>
    m.id !== editingSubMaterialId && String(m.code) === String(code)
  );

  if (existsCode) {
    alert("같은 코드가 이미 존재합니다!");
    return;
  }

  if (editingSubMaterialId !== null) {
    const target = subMaterials.find(m => m.id === editingSubMaterialId);
    if (!target) {
      alert("수정할 부재료를 찾을 수 없습니다.");
      editingSubMaterialId = null;
      return;
    }
    Object.assign(target, { code, name, price, date });
  } else {
    subMaterials.push({ id: Date.now(), code, name, price, date });
  }

  editingSubMaterialId = null;
  saveAll();
  loadSubMaterials();
  loadSubPriceHistory("");
  clearSubMaterialInputs();
}

// =============================
// 목록
// =============================
function getAllLatestSubMaterials() {
  const map = {};

  subMaterials.forEach((m) => {
    const key = String(m.code);

    if (!map[key] || new Date(m.date) > new Date(map[key].date)) {
      map[key] = m;
    }
  });

  return Object.values(map);
}

function loadSubMaterials() {
  const list = document.getElementById("subMaterialList");
  const keyword = (document.getElementById("subMaterialSearch")?.value || "").toLowerCase();

  list.innerHTML = "";

  const data = getAllLatestSubMaterials().filter(
    (m) =>
      m.name.toLowerCase().includes(keyword) ||
      String(m.code).toLowerCase().includes(keyword)
  );

  if (!data.length) {
    list.innerHTML = `<tr><td colspan="7">데이터 없음</td></tr>`;
    return;
  }

  data.forEach((m, i) => {
    list.innerHTML += `
      <tr>
        <td>${i + 1}</td>
        <td>${m.code}</td>
        <td class="product-link" onclick="editSubMaterial('${escapeJsString(m.code)}')" title="클릭하여 수정">${escapeHtml(m.name)}</td>
        <td>${formatNumber(m.price)} 원</td>
        <td>${m.date}</td>
        <td><button onclick="editSubMaterial('${m.code}')">수정</button></td>
        <td><button onclick="deleteSubMaterial('${m.code}')">삭제</button></td>
      </tr>
    `;
  });
}

// =============================
// 삭제 / 수정
// =============================
function deleteSubMaterial(code) {
  if (!confirm("삭제하시겠습니까?")) return;
  subMaterials = subMaterials.filter((m) => m.code !== code);
  saveAll();
  loadSubMaterials();
}

function editSubMaterial(code) {
  const material = getAllLatestSubMaterials().find(m => String(m.code) === String(code));
  if (!material) return;

  document.getElementById("subMaterialCode").value = material.code;
  document.getElementById("subMaterialName").value = material.name;
  document.getElementById("subMaterialPrice").value = material.price;
  document.getElementById("subMaterialDate").value = material.date;

  editingSubMaterialId = material.id;
  document.getElementById("subMaterialCode")?.focus();
}

// =============================
// 히스토리
// =============================
function loadSubPriceHistory(keyword = "") {
  const table = document.getElementById("subPriceHistoryTable");
  table.innerHTML = "";

  if (!keyword) return;

  const filtered = subMaterials.filter(m =>
    m.name.toLowerCase().includes(keyword.toLowerCase()) ||
    String(m.code).includes(keyword)
  );

  filtered.forEach((m) => {
    table.innerHTML += `
      <tr>
        <td>${m.code}</td>
        <td>${m.name}</td>
       <td>${formatNumber(m.price)} 원</td>
        <td>${m.date}</td>
        <td><button onclick="deleteSubPriceHistory(${m.id})">삭제</button></td>
      </tr>
    `;
  });
}

function searchSubPriceHistory() {
  const keyword = document.getElementById("subPriceSearch").value;
  loadSubPriceHistory(keyword);
}

function deleteSubPriceHistory(id) {
  subMaterials = subMaterials.filter((m) => m.id !== id);
  saveAll();
  loadSubPriceHistory("");
}
function handleSubExcelUpload() {
  const fileInput = document.getElementById("subExcelFile");
  const file = fileInput.files[0];

  if (!file) {
    alert("엑셀 파일을 선택해주세요.");
    return;
  }

  const reader = new FileReader();

  reader.onload = function (e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (!rows.length) {
      alert("엑셀 데이터가 없습니다.");
      return;
    }

    rows.forEach((row) => {
      const code = String(row["코드"] || "").trim();
      const name = String(row["이름"] || "").trim();

      const rawPrice = row["단가"] || "0";

      const price = parseFloat(
        String(rawPrice).replace(/[^\d.]/g, "")
      ) || 0;

      const date = new Date().toISOString().slice(0, 10);

      if (!code || !name) return;

      subMaterials.push({
        id: Date.now() + Math.random(),
        code,
        name,
        price,
        date
      });
    });

    saveAll();
    loadSubMaterials();
    loadSubPriceHistory("");

    fileInput.value = "";
    alert("부재료 엑셀 업로드 완료");
  };

  reader.readAsArrayBuffer(file);
}
function login() {
  const id = document.getElementById("loginId").value;
  const pw = document.getElementById("loginPw").value;

  if (id === "rnd" && pw === "1q2q3q4q@") {
    sessionStorage.setItem("isLogin", "true");

    document.getElementById("loginPage").style.display = "none";
    document.getElementById("mainPage").style.display = "block";

    showPage("db");
    startIdleTimer();
  } else {
    alert("아이디 또는 비밀번호 오류");
  }
}

// 20260331 자동 로그인 삭제
window.addEventListener("DOMContentLoaded", () => {
  bindActivityEvents();

  const batchDateInput = document.getElementById("batchDate");
  if (batchDateInput && !batchDateInput.value) {
    const now = new Date();
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 10);
    batchDateInput.value = localDate;
  }

  if (isLoggedIn()) {
    document.getElementById("loginPage").style.display = "none";
    document.getElementById("mainPage").style.display = "block";
    showPage("db");
    startIdleTimer();
  } else {
    document.getElementById("loginPage").style.display = "flex";
    document.getElementById("mainPage").style.display = "none";
  }
});

// =============================
// 제품 재료비 v2: 원재료 + 부재료 + 개별 로스
// =============================
function getLatestSubMaterialByCode(code) {
  const cleanCode = String(code || "").trim();
  return getAllLatestSubMaterials().find(m => String(m.code || "").trim() === cleanCode) || null;
}

function getProductWeightKg(volume, unit, density) {
  const amount = Number(volume || 0);
  return String(unit || "g").toLowerCase() === "ml"
    ? amount * Number(density || 1) / 1000
    : amount / 1000;
}

function readPercent(id) {
  const value = Number(document.getElementById(id)?.value || 0);
  return Math.min(99.99, Math.max(0, value));
}

function applyLoss(cost, lossRate) {
  return Number(cost || 0) * (1 + Number(lossRate || 0) / 100);
}

function calculateFormCosts(data) {
  const rawCostPerKg = (data.recipe || []).reduce((sum, item) =>
    sum + Number(item.price || 0) * Number(item.ratio || 0) / 100, 0);
  const rawBaseEa = rawCostPerKg * getProductWeightKg(data.volume, data.unit, data.density);
  const subBaseEa = (data.subRecipe || []).reduce((sum, item) =>
    sum + Number(item.price || 0) * Number(item.ratio || 0), 0);
  const rawLossEa = applyLoss(rawBaseEa, data.materialLossRate);
  const subLossEa = applyLoss(subBaseEa, data.subMaterialLossRate);
  return {
    rawCostPerKg,
    rawBaseEa,
    subBaseEa,
    rawLossEa,
    subLossEa,
    productMaterialCost: rawLossEa + subLossEa
  };
}

function calculateLiveProductCosts(product) {
  const recipe = (product.recipe || []).map(item => ({
    ...item,
    price: getLatestRecordByCode(item.code)?.price ?? item.price ?? 0
  }));
  const subRecipe = (product.subRecipe || []).map(item => ({
    ...item,
    price: getLatestSubMaterialByCode(item.code)?.price ?? item.price ?? 0
  }));
  const result = calculateFormCosts({
    recipe,
    subRecipe,
    volume: product.volume,
    unit: product.unit,
    density: product.density,
    materialLossRate: product.materialLossRate || 0,
    subMaterialLossRate: product.subMaterialLossRate || 0
  });
  return {
    rawMaterialCost: result.rawLossEa,
    subMaterialCost: result.subLossEa,
    productMaterialCost: result.productMaterialCost,
    rawCostPerKg: result.rawCostPerKg
  };
}

function refreshCompositionOptions() {
  const rawOptions = document.getElementById("rawMaterialOptions");
  const subOptions = document.getElementById("subMaterialOptions");
  if (rawOptions) rawOptions.innerHTML = getAllLatestMaterials()
    .map(m => `<option value="${escapeHtml(m.name)}"></option>`).join("");
  if (subOptions) subOptions.innerHTML = getAllLatestSubMaterials()
    .map(m => `<option value="${escapeHtml(m.name)}"></option>`).join("");
}

function createCompositionRow(kind, initial = {}) {
  const isRaw = kind === "raw";
  const row = document.createElement("tr");
  row.innerHTML = `
    <td><input class="material-input" list="${isRaw ? "rawMaterialOptions" : "subMaterialOptions"}" value="${escapeHtml(initial.name || "")}" oninput="${isRaw ? "updateRecipeRow" : "updateSubRecipeRow"}(this)" placeholder="${isRaw ? "원재료" : "부재료"}명 입력" /></td>
    <td class="code">${escapeHtml(initial.code || "")}</td>
    <td class="price" data-price="${Number(initial.price || 0)}">${formatNumber(initial.price || 0)}</td>
    <td><input class="ratio-input" type="number" min="0" step="0.001" value="${Number(initial.ratio || 0)}" oninput="${isRaw ? "updateRecipeCalc" : "updateSubRecipeCalc"}()" /></td>
    <td class="cost">0</td>
    <td><button type="button" class="delete-btn" onclick="this.closest('tr').remove(); ${isRaw ? "updateRecipeCalc" : "updateSubRecipeCalc"}();">삭제</button></td>
  `;
  return row;
}

window.addRecipe = function () {
  refreshCompositionOptions();
  document.querySelector("#recipeTable tbody")?.appendChild(createCompositionRow("raw"));
};

window.addSubRecipe = function () {
  refreshCompositionOptions();
  document.querySelector("#subRecipeTable tbody")?.appendChild(createCompositionRow("sub"));
};

window.updateRecipeRow = function (input) {
  const row = input.closest("tr");
  const material = getAllLatestMaterials().find(m => m.name === input.value.trim());
  row.querySelector(".code").innerText = material?.code || "";
  row.querySelector(".price").innerText = formatNumber(material?.price || 0);
  row.querySelector(".price").dataset.price = material?.price || 0;
  updateRecipeCalc();
};

window.updateSubRecipeRow = function (input) {
  const row = input.closest("tr");
  const material = getAllLatestSubMaterials().find(m => m.name === input.value.trim());
  row.querySelector(".code").innerText = material?.code || "";
  row.querySelector(".price").innerText = formatNumber(material?.price || 0);
  row.querySelector(".price").dataset.price = material?.price || 0;
  updateSubRecipeCalc();
};

window.updateRecipeCalc = function () {
  let totalRatio = 0;
  let totalCostPerKg = 0;
  const weightKg = getProductWeightKg(
    document.getElementById("productVolume")?.value,
    document.getElementById("productUnit")?.value,
    document.getElementById("productDensity")?.value
  );
  document.querySelectorAll("#recipeTable tbody tr").forEach(row => {
    const price = parseFloat(row.querySelector(".price")?.dataset.price) || 0;
    const ratio = parseFloat(row.querySelector(".ratio-input")?.value) || 0;
    const costPerKg = price * ratio / 100;
    row.querySelector(".cost").innerText = formatNumber(Math.round(costPerKg * weightKg));
    totalRatio += ratio;
    totalCostPerKg += costPerKg;
  });
  const baseEa = totalCostPerKg * weightKg;
  document.getElementById("ratioSum").innerText = totalRatio.toFixed(1);
  document.getElementById("materialCostSum").innerText = `${formatNumber(Math.round(baseEa))} 원/ea`;
  updateProductMaterialCost();
};

window.updateSubRecipeCalc = function () {
  let totalRatio = 0;
  let totalCost = 0;
  document.querySelectorAll("#subRecipeTable tbody tr").forEach(row => {
    const price = parseFloat(row.querySelector(".price")?.dataset.price) || 0;
    const ratio = parseFloat(row.querySelector(".ratio-input")?.value) || 0;
    const cost = price * ratio;
    row.querySelector(".cost").innerText = formatNumber(Math.round(cost));
    totalRatio += ratio;
    totalCost += cost;
  });
  document.getElementById("subRatioSum").innerText = formatNumber(totalRatio);
  document.getElementById("subMaterialCostSum").innerText = `${formatNumber(Math.round(totalCost))} 원/ea`;
  updateProductMaterialCost();
};

window.updateProductMaterialCost = function () {
  let rawCostPerKg = 0;
  document.querySelectorAll("#recipeTable tbody tr").forEach(row => {
    rawCostPerKg += (parseFloat(row.querySelector(".price")?.dataset.price) || 0) *
      (parseFloat(row.querySelector(".ratio-input")?.value) || 0) / 100;
  });
  const rawBase = rawCostPerKg * getProductWeightKg(
    document.getElementById("productVolume")?.value,
    document.getElementById("productUnit")?.value,
    document.getElementById("productDensity")?.value
  );
  let subBase = 0;
  document.querySelectorAll("#subRecipeTable tbody tr").forEach(row => {
    subBase += (parseFloat(row.querySelector(".price")?.dataset.price) || 0) *
      (parseFloat(row.querySelector(".ratio-input")?.value) || 0);
  });
  const rawLoss = applyLoss(rawBase, readPercent("materialLossRate"));
  const subLoss = applyLoss(subBase, readPercent("subMaterialLossRate"));
  const values = {
    rawMaterialBaseCost: rawBase,
    subMaterialBaseCost: subBase,
    rawLossBaseText: rawBase,
    subLossBaseText: subBase,
    rawLossAppliedCost: rawLoss,
    subLossAppliedCost: subLoss,
    unitCostDisplay: rawLoss + subLoss
  };
  Object.entries(values).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.innerText = formatNumber(Math.round(value));
  });
};

window.exportSelectedProductExcel = function () {
  const selectedIds = Array.from(document.querySelectorAll("#recipeProductList .rowCheck:checked"))
    .map(cb => Number(cb.value));
  if (!selectedIds.length) {
    alert("엑셀로 저장할 제품을 선택하세요.");
    return;
  }
  const rows = products
    .filter(p => selectedIds.includes(Number(p.id)))
    .map(p => {
      const live = calculateLiveProductCosts(p);
      return {
        유형: p.type || "",
        제품명: p.name || "",
        내용량: p.volume || 0,
        단위: p.unit || "g",
        "원재료 로스율(%)": p.materialLossRate || 0,
        "부재료 로스율(%)": p.subMaterialLossRate || 0,
        "원재료비(원/ea)": Math.round(live.rawMaterialCost),
        "부재료비(원/ea)": Math.round(live.subMaterialCost),
        "제품 재료비(원/ea)": Math.round(live.productMaterialCost),
        저장일: p.date ? new Date(p.date).toLocaleString("ko-KR") : ""
      };
    });
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "제품 재료비");
  XLSX.writeFile(workbook, `제품_재료비_${new Date().toISOString().slice(0, 10)}.xlsx`);
};

// =============================
// PRE-COST 견적 계산 v3
// =============================
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerText = value;
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function makeQuoteNo() {
  const date = (document.getElementById("quoteDate")?.value || getLocalDateString()).replaceAll("-", "");
  const todayCount = quotes.filter(q => String(q.quoteNo || "").startsWith(`Q-${date}`)).length + 1;
  return `Q-${date}-${String(todayCount).padStart(2, "0")}`;
}

window.refreshQuoteNo = function () {
  const quoteNo = document.getElementById("quoteNo");
  if (quoteNo) quoteNo.value = makeQuoteNo();
  calculatePreCost(false);
};

function getOrderForecast(moq) {
  const frequency = document.getElementById("orderFrequency")?.value || "monthly1";
  const customAnnual = getNumberValue("customAnnualQty");
  if (frequency === "once") return { monthly: 0, annual: moq, label: "일회성" };
  if (frequency === "monthly2") return { monthly: moq * 2, annual: moq * 24, label: "월 2회" };
  if (frequency === "weekly1") return { monthly: moq * 52 / 12, annual: moq * 52, label: "주 1회" };
  if (frequency === "custom") return { monthly: customAnnual / 12, annual: customAnnual, label: "직접 입력" };
  return { monthly: moq, annual: moq * 12, label: "월 1회" };
}

window.updateOrderForecast = function () {
  const frequency = document.getElementById("orderFrequency")?.value || "monthly1";
  const customField = document.getElementById("customAnnualField");
  if (customField) customField.hidden = frequency !== "custom";
  calculatePreCost(false);
};

function updateMoqStatus(moq, standardBatch) {
  const status = document.getElementById("moqStatus");
  if (!status) return;
  if (moq <= 0 || standardBatch <= 0) {
    status.innerHTML = "-";
    return;
  }
  if (moq >= standardBatch) {
    status.innerHTML = `충족 <em class="status-good">적합</em>`;
  } else {
    const shortage = standardBatch - moq;
    status.innerHTML = `미충족 <em class="status-review">${formatNumber(shortage)}ea 부족</em>`;
  }
}

function loadCalcProductsV3() {
  const select = document.getElementById("calcProductSelect");
  if (!select) return;
  const selected = select.value;
  select.innerHTML = `<option value="">선택</option>` + products.map(p =>
    `<option value="${p.id}">${escapeHtml(p.name || "")}</option>`
  ).join("");
  if (selected && products.some(p => String(p.id) === String(selected))) select.value = selected;
}

window.loadMaterialCostFromProduct = function () {
  const productId = document.getElementById("calcProductSelect")?.value || "";
  const product = products.find(p => String(p.id) === String(productId));
  const volume = document.getElementById("quoteProductVolume");
  if (volume) volume.value = product ? `${formatNumber(product.volume || 0)} ${product.unit || "g"}` : "";
  calculatePreCost(false);
};

function calculatePreCost(showAlert = true) {
  const productId = document.getElementById("calcProductSelect")?.value || "";
  const product = products.find(p => String(p.id) === String(productId));
  const moq = getNumberValue("moqQty");
  const standardBatch = getNumberValue("standardBatchQty");
  const expectedYieldRate = getNumberValue("expectedYieldRate");
  const sgaRate = getNumberValue("sgaRate");
  const marginRate = getNumberValue("marginRate");

  if (!product) {
    if (showAlert) alert("제품을 선택하세요.");
    return null;
  }
  if (moq <= 0) {
    if (showAlert) alert("견적 기준 수량(MOQ)을 입력하세요.");
    return null;
  }
  if (expectedYieldRate <= 0 || expectedYieldRate > 100) {
    if (showAlert) alert("예상 공정수율은 0% 초과 100% 이하로 입력하세요.");
    return null;
  }
  if (sgaRate < 0 || marginRate < 0 || sgaRate + marginRate >= 100) {
    if (showAlert) alert("판관비율과 목표이익률의 합계는 0% 이상 100% 미만이어야 합니다.");
    return null;
  }

  const live = calculateLiveProductCosts(product);
  const rawMaterialCost = Number(live.rawMaterialCost || 0);
  const subMaterialCost = Number(live.subMaterialCost || 0);
  const productMaterialCost = rawMaterialCost + subMaterialCost;
  const yieldAdjustedMaterialCost = productMaterialCost / (expectedYieldRate / 100);

  const workerCount = getNumberValue("workerCount");
  const workHours = getNumberValue("workHours");
  const hourlyLaborCost = getNumberValue("hourlyLaborCost");
  const lineHours = getNumberValue("lineHours");
  const hourlyMfgCost = getNumberValue("hourlyMfgCost");
  const batchLaborCost = workerCount * workHours * hourlyLaborCost;
  const laborCostEa = batchLaborCost / moq;
  const batchMfgCost = lineHours * hourlyMfgCost;
  const mfgCostEa = batchMfgCost / moq;

  const logisticsBatchCost = getNumberValue("logisticsBatchCost");
  const logisticsCostEa = logisticsBatchCost / moq;
  const batchManHours = workerCount * workHours;
  const indirectRate = getNumberValue("indirectRate");
  const batchIndirectCost = batchManHours * indirectRate;
  const indirectCostEa = batchIndirectCost / moq;
  const batchExtraCost = getNumberValue("batchExtraCost");
  const batchExtraCostEa = batchExtraCost / moq;

  const forecast = getOrderForecast(moq);
  const oneTimeCost = getNumberValue("oneTimeCost");
  const oneTimeMode = document.getElementById("oneTimeMode")?.value || "separate";
  let oneTimeCostEa = 0;
  if (oneTimeMode === "first") oneTimeCostEa = oneTimeCost / moq;
  if (oneTimeMode === "annual" && forecast.annual > 0) oneTimeCostEa = oneTimeCost / forecast.annual;

  const totalCost = yieldAdjustedMaterialCost + laborCostEa + mfgCostEa + logisticsCostEa + indirectCostEa + batchExtraCostEa + oneTimeCostEa;
  const quotePrice = totalCost / (1 - (sgaRate + marginRate) / 100);
  const sgaCostEa = quotePrice * sgaRate / 100;
  const profitAmountEa = quotePrice * marginRate / 100;
  const costRateOfSales = quotePrice > 0 ? totalCost / quotePrice * 100 : 0;
  const costRatio = value => totalCost > 0 ? value / totalCost * 100 : 0;
  const oneTimeLabel = oneTimeMode === "separate" ? "별도 청구" : oneTimeMode === "company" ? "회사 부담" : `${formatNumber(Math.round(oneTimeCostEa))}원/ea`;

  const values = {
    quoteRawCost: rawMaterialCost, quoteSubCost: subMaterialCost, quoteMaterialCost: productMaterialCost,
    batchLaborCost, laborCostEa, batchMfgCost, mfgCostEa, logisticsCostEa,
    batchManHours, batchIndirectCost, indirectCostEa, batchExtraCostEa, oneTimeCostEa,
    resultMaterialCost: productMaterialCost, resultYieldMaterialCost: yieldAdjustedMaterialCost,
    resultLaborCost: laborCostEa, resultMfgCost: mfgCostEa, resultLogisticsCost: logisticsCostEa,
    resultIndirectCost: indirectCostEa, resultExtraCost: batchExtraCostEa,
    totalCostText: totalCost, result: quotePrice, formulaTotalCost: totalCost,
    sgaCostEa, profitAmountEa
  };
  Object.entries(values).forEach(([id, value]) => setText(id, formatNumber(Math.round(value))));
  setText("formulaMargin", Number(marginRate).toLocaleString("ko-KR"));
  setText("formulaSga", Number(sgaRate).toLocaleString("ko-KR"));
  setText("sgaRateText", Number(sgaRate).toFixed(2));
  setText("profitRateText", Number(marginRate).toFixed(2));
  setText("costRateOfSales", costRateOfSales.toFixed(2));
  setText("ratioMaterialCost", costRatio(productMaterialCost).toFixed(2));
  setText("ratioYieldMaterialCost", costRatio(yieldAdjustedMaterialCost).toFixed(2));
  setText("ratioLaborCost", costRatio(laborCostEa).toFixed(2));
  setText("ratioMfgCost", costRatio(mfgCostEa).toFixed(2));
  setText("ratioLogisticsCost", costRatio(logisticsCostEa).toFixed(2));
  setText("ratioIndirectCost", costRatio(indirectCostEa).toFixed(2));
  setText("ratioExtraCost", costRatio(batchExtraCostEa).toFixed(2));
  setText("ratioOneTimeCost", oneTimeCostEa > 0 ? `${costRatio(oneTimeCostEa).toFixed(2)}%` : "-");
  setText("resultOneTimeText", oneTimeLabel);
  setText("kpiMoq", `${formatNumber(Math.round(moq))} ea`);
  setText("monthlyExpectedQty", `${formatNumber(Math.round(forecast.monthly))} ea`);
  setText("annualExpectedQtyText", `${formatNumber(Math.round(forecast.annual))} ea`);
  const annualInput = document.getElementById("annualExpectedQty");
  if (annualInput) annualInput.value = `${formatNumber(Math.round(forecast.annual))} ea`;
  updateMoqStatus(moq, standardBatch);

  return {
    productId, productName: product.name || "", productType: product.type || "", productVolume: product.volume || 0,
    productUnit: product.unit || "g", quoteDate: document.getElementById("quoteDate")?.value || "",
    quoteNo: document.getElementById("quoteNo")?.value || "", moq, standardBatch, expectedYieldRate,
    orderFrequency: document.getElementById("orderFrequency")?.value || "monthly1", orderFrequencyLabel: forecast.label,
    monthlyExpectedQty: forecast.monthly, annualExpectedQty: forecast.annual,
    rawMaterialCost, subMaterialCost, productMaterialCost, yieldAdjustedMaterialCost,
    workerCount, workHours, hourlyLaborCost, batchLaborCost, laborCostEa,
    lineHours, hourlyMfgCost, batchMfgCost, mfgCostEa,
    logisticsBatchCost, logisticsCostEa, batchManHours, indirectRate, batchIndirectCost, indirectCostEa,
    batchExtraReason: document.getElementById("batchExtraReason")?.value.trim() || "", batchExtraCost, batchExtraCostEa,
    oneTimeReason: document.getElementById("oneTimeReason")?.value.trim() || "", oneTimeCost, oneTimeMode, oneTimeCostEa,
    totalCost, sgaRate, sgaCostEa, marginRate, profitAmountEa, costRateOfSales, quotePrice, vatExcluded: true
  };
}

window.calculatePreCost = calculatePreCost;

window.savePreCostQuote = function () {
  const calculated = calculatePreCost(true);
  if (!calculated) return;
  if (!calculated.quoteDate) {
    alert("견적일을 입력하세요.");
    return;
  }
  if (!calculated.quoteNo) calculated.quoteNo = makeQuoteNo();
  const existingIndex = quotes.findIndex(q => q.quoteNo === calculated.quoteNo);
  const saved = { id: existingIndex >= 0 ? quotes[existingIndex].id : Date.now(), ...calculated, savedAt: new Date().toISOString() };
  if (existingIndex >= 0) quotes.splice(existingIndex, 1, saved);
  else quotes.push(saved);
  saveAll();
  loadQuotes();
  alert("견적이 저장되었습니다. 5 견적 조회에서 확인할 수 있습니다.");
};

function initializePreCostForm() {
  loadCalcProductsV3();
  const quoteDate = document.getElementById("quoteDate");
  if (quoteDate && !quoteDate.value) quoteDate.value = getLocalDateString();
  const quoteNo = document.getElementById("quoteNo");
  if (quoteNo && !quoteNo.value) quoteNo.value = makeQuoteNo();
  updateOrderForecast();
}

function populatePreCostForm(q) {
  const mapping = {
    quoteDate: q.quoteDate, quoteNo: q.quoteNo, moqQty: q.moq, standardBatchQty: q.standardBatch,
    expectedYieldRate: q.expectedYieldRate, workerCount: q.workerCount, workHours: q.workHours,
    hourlyLaborCost: q.hourlyLaborCost, lineHours: q.lineHours, hourlyMfgCost: q.hourlyMfgCost,
    logisticsBatchCost: q.logisticsBatchCost, indirectRate: q.indirectRate,
    batchExtraReason: q.batchExtraReason, batchExtraCost: q.batchExtraCost,
    oneTimeReason: q.oneTimeReason, oneTimeCost: q.oneTimeCost, sgaRate: q.sgaRate ?? 0, marginRate: q.marginRate
  };
  Object.entries(mapping).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.value = value ?? "";
  });
  loadCalcProductsV3();
  const productSelect = document.getElementById("calcProductSelect");
  if (productSelect) productSelect.value = q.productId || "";
  const frequency = document.getElementById("orderFrequency");
  if (frequency) frequency.value = q.orderFrequency || "monthly1";
  const oneTimeMode = document.getElementById("oneTimeMode");
  if (oneTimeMode) oneTimeMode.value = q.oneTimeMode || "separate";
  if (q.orderFrequency === "custom") {
    const custom = document.getElementById("customAnnualQty");
    if (custom) custom.value = q.annualExpectedQty || 0;
  }
  loadMaterialCostFromProduct();
  updateOrderForecast();
}

window.loadQuote = function (id) {
  const q = quotes.find(item => String(item.id) === String(id));
  if (!q) return;
  showPage("calc");
  populatePreCostForm(q);
};

window.loadQuotes = function () {
  const list = document.getElementById("quoteList");
  if (!list) return;
  const keyword = (document.getElementById("quoteSearch")?.value || "").trim().toLowerCase();
  const filtered = quotes.filter(q => !keyword ||
    String(q.productName || q.name || "").toLowerCase().includes(keyword) ||
    String(q.quoteNo || "").toLowerCase().includes(keyword)
  ).sort((a, b) => new Date(b.savedAt || b.quoteDate || b.date) - new Date(a.savedAt || a.quoteDate || a.date));
  if (!filtered.length) {
    list.innerHTML = `<tr><td colspan="12">저장된 견적이 없습니다.</td></tr>`;
    return;
  }
  list.innerHTML = filtered.map(q => `
    <tr>
      <td><input type="checkbox" class="rowCheck" value="${q.id}"></td>
      <td>${escapeHtml(q.quoteNo || "-")}</td>
      <td>${escapeHtml(q.quoteDate || q.date || "-")}</td>
      <td>${escapeHtml(q.productName || q.name || "-")}</td>
      <td class="right">${formatNumber(Math.round(q.moq || 0))} ea</td>
      <td>${escapeHtml(q.orderFrequencyLabel || "-")}</td>
      <td class="right">${formatNumber(Math.round(q.totalCost || q.cost || 0))}원/ea</td>
      <td>${formatNumber(q.sgaRate || 0)}%</td>
      <td>${formatNumber(q.marginRate || 0)}%</td>
      <td class="right product-cost-cell">${formatNumber(Math.round(q.quotePrice || q.unitCost || 0))}원/ea<br><small>부가세 별도</small></td>
      <td>${q.savedAt ? new Date(q.savedAt).toLocaleString("ko-KR") : "-"}</td>
      <td><button type="button" onclick="loadQuote('${q.id}')">상세보기</button></td>
    </tr>`).join("");
};

const showPageBeforePreCost = window.showPage;
window.showPage = function (id) {
  showPageBeforePreCost(id);
  document.querySelectorAll(".menu button[data-page]").forEach(button =>
    button.classList.toggle("active", button.dataset.page === id)
  );
  if (id === "calc") initializePreCostForm();
  if (id === "history") loadQuotes();
};
