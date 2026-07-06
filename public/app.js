let currentUser = null;
let currentProjectId = null;
let currentProjects = [];
let currentFiles = [];
let currentPeople = [];
let currentView = "dashboard";
let currentCategory = null;
let uploadState = null;
let uploadQueue = [];
let uploadErrors = 0;
let uploadsRefreshGrid = null;
let searchQuery = "";
let resetToken = null;
let viewScale = Number(localStorage.getItem("fileViewScale") ?? 2);
let sortMode = localStorage.getItem("fileSort") || "date_desc";

const authScreen = document.getElementById("authScreen");
const appShell = document.getElementById("appShell");
const tabLogin = document.getElementById("tabLogin");
const tabRegister = document.getElementById("tabRegister");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const forgotForm = document.getElementById("forgotForm");
const resetForm = document.getElementById("resetForm");
const forgotLink = document.getElementById("forgotLink");
const backToLogin = document.getElementById("backToLogin");
const authMessage = document.getElementById("authMessage");
const projectRenameBtn = document.getElementById("projectRenameBtn");
const projectStats = document.getElementById("projectStats");
const userNameText = document.getElementById("userNameText");
const userRenameBtn = document.getElementById("userRenameBtn");

const projectList = document.getElementById("projectList");
const projectTitle = document.getElementById("projectTitle");
const newProjectBtn = document.getElementById("newProjectBtn");
const viewCrumb = document.getElementById("viewCrumb");
const viewEl = document.getElementById("view");
const projectAvatar = document.getElementById("projectAvatar");
const projectImageInput = document.getElementById("projectImageInput");
const userBox = document.getElementById("userBox");
const userName = document.getElementById("userName");
const userRole = document.getElementById("userRole");
const logoutBtn = document.getElementById("logoutBtn");
const navAdmin = document.querySelector(".nav-admin");

/* Icons: Remix Icon (Apache 2.0), Basis des Streamline-Sets "Sharp Remix" */
const ICON_PATHS = {
  alle: "M4 5V19H20V7H11.5858L9.58579 5H4ZM12.4142 5H21C21.5523 5 22 5.44772 22 6V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V4C2 3.44772 2.44772 3 3 3H10.4142L12.4142 5Z",
  video: "M2 3.9934C2 3.44476 2.45531 3 2.9918 3H21.0082C21.556 3 22 3.44495 22 3.9934V20.0066C22 20.5552 21.5447 21 21.0082 21H2.9918C2.44405 21 2 20.5551 2 20.0066V3.9934ZM8 5V19H16V5H8ZM4 5V7H6V5H4ZM18 5V7H20V5H18ZM4 9V11H6V9H4ZM18 9V11H20V9H18ZM4 13V15H6V13H4ZM18 13V15H20V13H18ZM4 17V19H6V17H4ZM18 17V19H20V17H18Z",
  audio: "M20 3V17C20 19.2091 18.2091 21 16 21C13.7909 21 12 19.2091 12 17C12 14.7909 13.7909 13 16 13C16.7286 13 17.4117 13.1948 18 13.5351V5H9V17C9 19.2091 7.20914 21 5 21C2.79086 21 1 19.2091 1 17C1 14.7909 2.79086 13 5 13C5.72857 13 6.41165 13.1948 7 13.5351V3H20ZM5 19C6.10457 19 7 18.1046 7 17C7 15.8954 6.10457 15 5 15C3.89543 15 3 15.8954 3 17C3 18.1046 3.89543 19 5 19ZM16 19C17.1046 19 18 18.1046 18 17C18 15.8954 17.1046 15 16 15C14.8954 15 14 15.8954 14 17C14 18.1046 14.8954 19 16 19Z",
  images: "M2.9918 21C2.44405 21 2 20.5551 2 20.0066V3.9934C2 3.44476 2.45531 3 2.9918 3H21.0082C21.556 3 22 3.44495 22 3.9934V20.0066C22 20.5552 21.5447 21 21.0082 21H2.9918ZM20 15V5H4V19L14 9L20 15ZM20 17.8284L14 11.8284L6.82843 19H20V17.8284ZM8 11C6.89543 11 6 10.1046 6 9C6 7.89543 6.89543 7 8 7C9.10457 7 10 7.89543 10 9C10 10.1046 9.10457 11 8 11Z",
  logos: "M16.5962 1.03651L22.9428 7.38312C23.1381 7.57838 23.1381 7.89496 22.9428 8.09022C22.8679 8.16513 22.7712 8.21431 22.6665 8.23067L21.1924 8.46113L15.5356 2.80428L15.7477 1.31935C15.7868 1.04599 16.04 0.856036 16.3134 0.895088C16.4205 0.910388 16.5197 0.960011 16.5962 1.03651ZM4.59487 20.1478C8.31725 16.8163 12.5899 15.82 17.2379 14.6273L17.6843 10.6099L13.3869 6.31241L9.36936 6.7588C8.17674 11.4068 7.18038 15.6795 3.84886 19.4018L2.4541 18.0071C5.28253 14.7072 6.34319 11.0539 7.7574 4.9256L14.1214 4.21849L19.7783 9.87539L19.0711 16.2393C12.9429 17.6535 9.28947 18.7142 5.98964 21.5426L4.59487 20.1478ZM9.87872 14.118C9.09767 13.3369 9.09767 12.0706 9.87872 11.2896C10.6598 10.5085 11.9261 10.5085 12.7071 11.2896C13.4882 12.0706 13.4882 13.3369 12.7071 14.118C11.9261 14.899 10.6598 14.899 9.87872 14.118Z",
  text: "M21 8V20.9932C21 21.5501 20.5552 22 20.0066 22H3.9934C3.44495 22 3 21.556 3 21.0082V2.9918C3 2.45531 3.4487 2 4.00221 2H14.9968L21 8ZM19 9H14V4H5V20H19V9ZM8 7H11V9H8V7ZM8 11H16V13H8V11ZM8 15H16V17H8V15Z",
  regieplan: "M17 2H20C20.5523 2 21 2.44772 21 3V21C21 21.5523 20.5523 22 20 22H4C3.44772 22 3 21.5523 3 21V3C3 2.44772 3.44772 2 4 2H7V0H9V2H15V0H17V2ZM17 4V6H15V4H9V6H7V4H5V20H19V4H17ZM7 8H17V10H7V8ZM7 12H17V14H7V12Z",
  html: "M24 12L18.3431 17.6569L16.9289 16.2426L21.1716 12L16.9289 7.75736L18.3431 6.34315L24 12ZM2.82843 12L7.07107 16.2426L5.65685 17.6569L0 12L5.65685 6.34315L7.07107 7.75736L2.82843 12ZM9.78845 21H7.66009L14.2116 3H16.3399L9.78845 21Z",
  other: "M12 1L21.5 6.5V17.5L12 23L2.5 17.5V6.5L12 1ZM5.49388 7.0777L12.0001 10.8444L18.5062 7.07774L12 3.311L5.49388 7.0777ZM4.5 8.81329V16.3469L11.0001 20.1101V12.5765L4.5 8.81329ZM13.0001 20.11L19.5 16.3469V8.81337L13.0001 12.5765V20.11Z",
  uploads: "M12 12.5858L16.2426 16.8284L14.8284 18.2426L13 16.415V22H11V16.413L9.17157 18.2426L7.75736 16.8284L12 12.5858ZM12 2C15.5934 2 18.5544 4.70761 18.9541 8.19395C21.2858 8.83154 23 10.9656 23 13.5C23 16.3688 20.8036 18.7246 18.0006 18.9776L18.0009 16.9644C19.6966 16.7214 21 15.2629 21 13.5C21 11.567 19.433 10 17.5 10C17.2912 10 17.0867 10.0183 16.8887 10.054C16.9616 9.7142 17 9.36158 17 9C17 6.23858 14.7614 4 12 4C9.23858 4 7 6.23858 7 9C7 9.36158 7.03838 9.7142 7.11205 10.0533C6.91331 10.0183 6.70879 10 6.5 10C4.567 10 3 11.567 3 13.5C3 15.2003 4.21241 16.6174 5.81986 16.934L6.00005 16.9646L6.00039 18.9776C3.19696 18.7252 1 16.3692 1 13.5C1 10.9656 2.71424 8.83154 5.04648 8.19411C5.44561 4.70761 8.40661 2 12 2Z",
  show: "M15.4142 4.99998H21.0082C21.556 4.99998 22 5.44461 22 6.00085V19.9991C22 20.5519 21.5447 21 21.0082 21H2.9918C2.44405 21 2 20.5553 2 19.9991V6.00085C2 5.44808 2.45531 4.99998 2.9918 4.99998H8.58579L6.05025 2.46445L7.46447 1.05023L11.4142 4.99998H12.5858L16.5355 1.05023L17.9497 2.46445L15.4142 4.99998ZM4 6.99998V19H20V6.99998H4Z",
  people: "M2 22C2 17.5817 5.58172 14 10 14C14.4183 14 18 17.5817 18 22H16C16 18.6863 13.3137 16 10 16C6.68629 16 4 18.6863 4 22H2ZM10 13C6.685 13 4 10.315 4 7C4 3.685 6.685 1 10 1C13.315 1 16 3.685 16 7C16 10.315 13.315 13 10 13ZM10 11C12.21 11 14 9.21 14 7C14 4.79 12.21 3 10 3C7.79 3 6 4.79 6 7C6 9.21 7.79 11 10 11ZM18.2837 14.7028C21.0644 15.9561 23 18.752 23 22H21C21 19.564 19.5483 17.4671 17.4628 16.5271L18.2837 14.7028ZM17.5962 3.41321C19.5944 4.23703 21 6.20361 21 8.5C21 11.3702 18.8042 13.7252 16 13.9776V11.9646C17.6967 11.7222 19 10.264 19 8.5C19 7.11935 18.2016 5.92603 17.041 5.35635L17.5962 3.41321Z",
  regie: "M5.99807 7L8.30747 3H11.9981L9.68867 7H5.99807ZM11.9981 7L14.3075 3H17.9981L15.6887 7H11.9981ZM17.9981 7L20.3075 3H21.0082C21.556 3 22 3.44495 22 3.9934V20.0066C22 20.5552 21.5447 21 21.0082 21H2.9918C2.44405 21 2 20.5551 2 20.0066V3.9934C2 3.44476 2.45531 3 2.9918 3H5.99807L4 6.46076V19H20V7H17.9981Z",
  player: "M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20ZM10.6219 8.41459L15.5008 11.6672C15.6846 11.7897 15.7343 12.0381 15.6117 12.2219C15.5824 12.2658 15.5447 12.3035 15.5008 12.3328L10.6219 15.5854C10.4381 15.708 10.1897 15.6583 10.0672 15.4745C10.0234 15.4088 10 15.3316 10 15.2526V8.74741C10 8.52649 10.1791 8.34741 10.4 8.34741C10.479 8.34741 10.5562 8.37078 10.6219 8.41459Z",
  exports: "M13 10H18L12 16L6 10H11V3H13V10ZM4 19H20V12H22V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V12H4V19Z",
  archive: "M3 10H2V4.00293C2 3.44903 2.45531 3 2.9918 3H21.0082C21.556 3 22 3.43788 22 4.00293V10H21V20.0015C21 20.553 20.5551 21 20.0066 21H3.9934C3.44476 21 3 20.5525 3 20.0015V10ZM19 10H5V19H19V10ZM4 5V8H20V5H4ZM9 12H15V14H9V12Z",
  trash: "M17 6H22V8H20V21C20 21.5523 19.5523 22 19 22H5C4.44772 22 4 21.5523 4 21V8H2V6H7V3C7 2.44772 7.44772 2 8 2H16C16.5523 2 17 2.44772 17 3V6ZM18 8H6V20H18V8ZM9 11H11V17H9V11ZM13 11H15V17H13V11ZM9 4V6H15V4H9Z",
  logout: "M5 22C4.44772 22 4 21.5523 4 21V3C4 2.44772 4.44772 2 5 2H19C19.5523 2 20 2.44772 20 3V6H18V4H6V20H18V18H20V21C20 21.5523 19.5523 22 19 22H5ZM18 16V13H11V11H18V8L23 12L18 16Z",
  admin: "M3.78307 2.82598L12 1L20.2169 2.82598C20.6745 2.92766 21 3.33347 21 3.80217V13.7889C21 15.795 19.9974 17.6684 18.3282 18.7812L12 23L5.6718 18.7812C4.00261 17.6684 3 15.795 3 13.7889V3.80217C3 3.33347 3.32553 2.92766 3.78307 2.82598ZM5 4.60434V13.7889C5 15.1263 5.6684 16.3752 6.7812 17.1171L12 20.5963L17.2188 17.1171C18.3316 16.3752 19 15.1263 19 13.7889V4.60434L12 3.04879L5 4.60434ZM12 11C10.6193 11 9.5 9.88071 9.5 8.5C9.5 7.11929 10.6193 6 12 6C13.3807 6 14.5 7.11929 14.5 8.5C14.5 9.88071 13.3807 11 12 11ZM7.52746 16C7.77619 13.75 9.68372 12 12 12C14.3163 12 16.2238 13.75 16.4725 16H7.52746Z",
  check: "M9.9997 15.1709L19.1921 5.97852L20.6063 7.39273L9.9997 17.9993L3.63574 11.6354L5.04996 10.2212L9.9997 15.1709Z",
  close: "M11.9997 10.5865L16.9495 5.63672L18.3637 7.05093L13.4139 12.0007L18.3637 16.9504L16.9495 18.3646L11.9997 13.4149L7.04996 18.3646L5.63574 16.9504L10.5855 12.0007L5.63574 7.05093L7.04996 5.63672L11.9997 10.5865Z",
  time: "M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20ZM13 12H17V14H11V7H13V12Z",
  mail: "M3 3H21C21.5523 3 22 3.44772 22 4V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V4C2 3.44772 2.44772 3 3 3ZM20 7.23792L12.0718 14.338L4 7.21594V19H20V7.23792ZM4.51146 5L12.0619 11.662L19.501 5H4.51146Z",
  eye: "M12.0003 3C17.3924 3 21.8784 6.87976 22.8189 12C21.8784 17.1202 17.3924 21 12.0003 21C6.60812 21 2.12215 17.1202 1.18164 12C2.12215 6.87976 6.60812 3 12.0003 3ZM12.0003 19C16.2359 19 19.8603 16.052 20.7777 12C19.8603 7.94803 16.2359 5 12.0003 5C7.7646 5 4.14022 7.94803 3.22278 12C4.14022 16.052 7.7646 19 12.0003 19ZM12.0003 16.5C9.51498 16.5 7.50026 14.4853 7.50026 12C7.50026 9.51472 9.51498 7.5 12.0003 7.5C14.4855 7.5 16.5003 9.51472 16.5003 12C16.5003 14.4853 14.4855 16.5 12.0003 16.5ZM12.0003 14.5C13.381 14.5 14.5003 13.3807 14.5003 12C14.5003 10.6193 13.381 9.5 12.0003 9.5C10.6196 9.5 9.50026 10.6193 9.50026 12C9.50026 13.3807 10.6196 14.5 12.0003 14.5Z",
  eyeoff: "M17.8827 19.2968C16.1814 20.3755 14.1638 21.0002 12.0003 21.0002C6.60812 21.0002 2.12215 17.1204 1.18164 12.0002C1.61832 9.62282 2.81932 7.5129 4.52047 5.93457L1.39366 2.80777L2.80788 1.39355L22.6069 21.1925L21.1927 22.6068L17.8827 19.2968ZM5.9356 7.3497C4.60673 8.56015 3.6378 10.1672 3.22278 12.0002C4.14022 16.0521 7.7646 19.0002 12.0003 19.0002C13.5997 19.0002 15.112 18.5798 16.4243 17.8384L14.396 15.8101C13.7023 16.2472 12.8808 16.5002 12.0003 16.5002C9.51498 16.5002 7.50026 14.4854 7.50026 12.0002C7.50026 11.1196 7.75317 10.2981 8.19031 9.60442L5.9356 7.3497ZM12.9139 14.328L9.67246 11.0866C9.5613 11.3696 9.50026 11.6777 9.50026 12.0002C9.50026 13.3809 10.6196 14.5002 12.0003 14.5002C12.3227 14.5002 12.6309 14.4391 12.9139 14.328ZM20.8068 16.5925L19.376 15.1617C20.0319 14.2268 20.5154 13.1586 20.7777 12.0002C19.8603 7.94818 16.2359 5.00016 12.0003 5.00016C11.1544 5.00016 10.3329 5.11773 9.55249 5.33818L7.97446 3.76015C9.22127 3.26959 10.5793 3.00016 12.0003 3.00016C17.3924 3.00016 21.8784 6.87992 22.8189 12.0002C22.5067 13.6998 21.8038 15.2628 20.8068 16.5925ZM11.7229 7.50857C11.8146 7.50299 11.9071 7.50016 12.0003 7.50016C14.4855 7.50016 16.5003 9.51488 16.5003 12.0002C16.5003 12.0933 16.4974 12.1858 16.4919 12.2775L11.7229 7.50857Z",
  edit: "M15.7279 9.57627L14.3137 8.16206L5 17.4758V18.89H6.41421L15.7279 9.57627ZM17.1421 8.16206L18.5563 6.74785L17.1421 5.33363L15.7279 6.74785L17.1421 8.16206ZM7.24264 20.89H3V16.6473L16.435 3.21231C16.8256 2.82179 17.4587 2.82179 17.8492 3.21231L20.6777 6.04074C21.0682 6.43126 21.0682 7.06443 20.6777 7.45495L7.24264 20.89Z",
  search: "M18.031 16.6168L22.3137 20.8995L20.8995 22.3137L16.6168 18.031C15.0769 19.263 13.124 20 11 20C6.032 20 2 15.968 2 11C2 6.032 6.032 2 11 2C15.968 2 20 6.032 20 11C20 13.124 19.263 15.0769 18.031 16.6168ZM16.0247 15.8748C17.2475 14.6146 18 12.8956 18 11C18 7.1325 14.8675 4 11 4C7.1325 4 4 7.1325 4 11C4 14.8675 7.1325 18 11 18C12.8956 18 14.6146 17.2475 15.8748 16.0247L16.0247 15.8748Z",
  key: "M10.7577 11.8281L18.6066 3.97919L20.0208 5.3934L18.6066 6.80761L21.0815 9.28249L19.6673 10.6967L17.1924 8.22183L15.7782 9.63604L17.8995 11.7574L16.4853 13.1716L14.364 11.0503L12.1719 13.2423C13.4581 15.1837 13.246 17.8251 11.5355 19.5355C9.58291 21.4882 6.41709 21.4882 4.46447 19.5355C2.51184 17.5829 2.51184 14.4171 4.46447 12.4645C6.17493 10.754 8.81633 10.5419 10.7577 11.8281ZM10.1213 18.1213C11.2929 16.9497 11.2929 15.0503 10.1213 13.8787C8.94975 12.7071 7.05025 12.7071 5.87868 13.8787C4.70711 15.0503 4.70711 16.9497 5.87868 18.1213C7.05025 19.2929 8.94975 19.2929 10.1213 18.1213Z",
  database: "M5 12.5C5 12.8134 5.46101 13.3584 6.53047 13.8931C7.91405 14.5849 9.87677 15 12 15C14.1232 15 16.0859 14.5849 17.4695 13.8931C18.539 13.3584 19 12.8134 19 12.5V10.3287C17.35 11.3482 14.8273 12 12 12C9.17273 12 6.64996 11.3482 5 10.3287V12.5ZM19 15.3287C17.35 16.3482 14.8273 17 12 17C9.17273 17 6.64996 16.3482 5 15.3287V17.5C5 17.8134 5.46101 18.3584 6.53047 18.8931C7.91405 19.5849 9.87677 20 12 20C14.1232 20 16.0859 19.5849 17.4695 18.8931C18.539 18.3584 19 17.8134 19 17.5V15.3287ZM3 17.5V7.5C3 5.01472 7.02944 3 12 3C16.9706 3 21 5.01472 21 7.5V17.5C21 19.9853 16.9706 22 12 22C7.02944 22 3 19.9853 3 17.5ZM12 10C14.1232 10 16.0859 9.58492 17.4695 8.89313C18.539 8.3584 19 7.81342 19 7.5C19 7.18658 18.539 6.6416 17.4695 6.10687C16.0859 5.41508 14.1232 5 12 5C9.87677 5 7.91405 5.41508 6.53047 6.10687C5.46101 6.6416 5 7.18658 5 7.5C5 7.81342 5.46101 8.3584 6.53047 8.89313C7.91405 9.58492 9.87677 10 12 10Z",
  list: "M8 4H21V6H8V4ZM4.5 6.5C3.67157 6.5 3 5.82843 3 5C3 4.17157 3.67157 3.5 4.5 3.5C5.32843 3.5 6 4.17157 6 5C6 5.82843 5.32843 6.5 4.5 6.5ZM4.5 13.5C3.67157 13.5 3 12.8284 3 12C3 11.1716 3.67157 10.5 4.5 10.5C5.32843 10.5 6 11.1716 6 12C6 12.8284 5.32843 13.5 4.5 13.5ZM4.5 20.4C3.67157 20.4 3 19.7284 3 18.9C3 18.0716 3.67157 17.4 4.5 17.4C5.32843 17.4 6 18.0716 6 18.9C6 19.7284 5.32843 20.4 4.5 20.4ZM8 11H21V13H8V11ZM8 18H21V20H8V18Z",
  grid: "M21 3C21.5523 3 22 3.44772 22 4V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V4C2 3.44772 2.44772 3 3 3H21ZM11 13H4V19H11V13ZM20 13H13V19H20V13ZM11 5H4V11H11V5ZM20 5H13V11H20V5Z",
  user: "M4 22C4 17.5817 7.58172 14 12 14C16.4183 14 20 17.5817 20 22H18C18 18.6863 15.3137 16 12 16C8.68629 16 6 18.6863 6 22H4ZM12 13C8.685 13 6 10.315 6 7C6 3.685 8.685 1 12 1C15.315 1 18 3.685 18 7C18 10.315 15.315 13 12 13ZM12 11C14.21 11 16 9.21 16 7C16 4.79 14.21 3 12 3C9.79 3 8 4.79 8 7C8 9.21 9.79 11 12 11Z",
  phone: "M9.36556 10.6821C10.302 12.3288 11.6712 13.698 13.3179 14.6344L14.2024 13.3961C14.4965 12.9845 15.0516 12.8573 15.4956 13.0998C16.9024 13.8683 18.4571 14.3353 20.0789 14.4637C20.599 14.5049 21 14.9389 21 15.4606V19.9234C21 20.4361 20.6122 20.8657 20.1022 20.9181C19.5723 20.9726 19.0377 21 18.5 21C9.93959 21 3 14.0604 3 5.5C3 4.96227 3.02742 4.42771 3.08189 3.89776C3.1343 3.38775 3.56394 3 4.07665 3H8.53942C9.0611 3 9.49513 3.40104 9.5363 3.92109C9.66467 5.54288 10.1317 7.09764 10.9002 8.50444C11.1427 8.9484 11.0155 9.50354 10.6039 9.79757L9.36556 10.6821ZM6.84425 10.0252L8.7442 8.66809C8.20547 7.50514 7.83628 6.27183 7.64727 5H5.00907C5.00303 5.16632 5 5.333 5 5.5C5 12.9558 11.0442 19 18.5 19C18.667 19 18.8337 18.997 19 18.9909V16.3527C17.7282 16.1637 16.4949 15.7945 15.3319 15.2558L13.9748 17.1558C13.4258 16.9425 12.8956 16.6915 12.3874 16.4061L12.3293 16.373C10.3697 15.2587 8.74134 13.6303 7.627 11.6707L7.59394 11.6126C7.30849 11.1044 7.05754 10.5742 6.84425 10.0252Z",
  add: "M11 11V5H13V11H19V13H13V19H11V13H5V11H11Z"
};

function icon(name, cls) {
  const d = ICON_PATHS[name] || ICON_PATHS.other;
  return `<svg class="${cls || "icon"}" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="${d}"/></svg>`;
}

const CATEGORIES = [
  { key: "video", label: "Video" },
  { key: "audio", label: "Audio" },
  { key: "images", label: "Bilder" },
  { key: "logos", label: "Logos" },
  { key: "text", label: "Text" },
  { key: "regieplan", label: "Regieplan" },
  { key: "html", label: "HTML/Tools" },
  { key: "other", label: "Other" }
];

const SHOW_CATEGORIES = ["video", "audio", "images"];

const AREAS = [
  { key: "uploads", label: "Uploads", desc: "Alle Medien & Dateien", view: "uploads" },
  { key: "show", label: "Show", desc: "Für die Show freigegeben", view: "show" },
  { key: "people", label: "People", desc: "Beteiligte & Kontakte", view: "people" },
  { key: "regie", label: "Regie", desc: "Bald verfügbar", placeholder: true },
  { key: "player", label: "Player", desc: "Show-Playlist abspielen", view: "player" },
  { key: "exports", label: "Exports", desc: "Bald verfügbar", placeholder: true },
  { key: "archive", label: "Archive", desc: "Bald verfügbar", placeholder: true }
];

function isAdmin() {
  return currentUser && currentUser.role === "admin";
}

/* ---------- Auth ---------- */

function showAuthMessage(text, kind) {
  authMessage.hidden = !text;
  authMessage.textContent = text || "";
  authMessage.className = "auth-message" + (kind ? " is-" + kind : "");
}

function switchAuthTab(mode) {
  tabLogin.classList.toggle("is-active", mode === "login");
  tabRegister.classList.toggle("is-active", mode === "register");
  loginForm.hidden = mode !== "login";
  registerForm.hidden = mode !== "register";
  forgotForm.hidden = mode !== "forgot";
  resetForm.hidden = mode !== "reset";
}

tabLogin.onclick = () => switchAuthTab("login");
tabRegister.onclick = () => switchAuthTab("register");
forgotLink.onclick = () => {
  showAuthMessage("");
  switchAuthTab("forgot");
};
backToLogin.onclick = () => {
  showAuthMessage("");
  switchAuthTab("login");
};

forgotForm.onsubmit = async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(forgotForm));

  const res = await fetch("/api/auth/forgot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  const body = await res.json();
  forgotForm.reset();
  switchAuthTab("login");

  if (body.mailSent) {
    showAuthMessage("Falls die E-Mail registriert ist, wurde ein Reset-Link verschickt (2 Stunden gültig).", "ok");
  } else {
    showAuthMessage("Reset-Link wurde erstellt. Der Mailversand ist noch nicht aktiv – bitte wende dich an den Admin, er kann dir den Link geben.", "ok");
  }
};

resetForm.onsubmit = async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(resetForm));

  const res = await fetch("/api/auth/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: resetToken, password: data.password })
  });

  const body = await res.json();

  if (!res.ok) {
    showAuthMessage(body.error || "Zurücksetzen fehlgeschlagen", "error");
    return;
  }

  resetForm.reset();
  resetToken = null;
  switchAuthTab("login");
  showAuthMessage("Passwort gespeichert – du kannst dich jetzt anmelden.", "ok");
};

function initPwToggles() {
  document.querySelectorAll(".pw-toggle").forEach((btn) => {
    btn.innerHTML = icon("eye", "icon icon-sm");
    btn.onclick = () => {
      const input = btn.parentElement.querySelector("input");
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.innerHTML = icon(show ? "eyeoff" : "eye", "icon icon-sm");
    };
  });
}

loginForm.onsubmit = async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(loginForm));

  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  const body = await res.json();

  if (!res.ok) {
    showAuthMessage(body.error || "Anmeldung fehlgeschlagen", "error");
    return;
  }

  loginForm.reset();
  showAuthMessage("");
  await init();
};

registerForm.onsubmit = async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(registerForm));

  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  const body = await res.json();

  if (!res.ok) {
    showAuthMessage(body.error || "Registrierung fehlgeschlagen", "error");
    return;
  }

  registerForm.reset();
  switchAuthTab("login");

  if (body.isFirstAdmin) {
    showAuthMessage("Admin-Konto erstellt – du kannst dich jetzt anmelden.", "ok");
  } else if (body.mailSent) {
    showAuthMessage("Registriert! Bitte bestätige deine E-Mail über den Link im Postfach.", "ok");
  } else {
    showAuthMessage("Registriert! Ein Admin muss dein Konto jetzt freischalten.", "ok");
  }
};

logoutBtn.onclick = async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  location.hash = "";
  location.reload();
};

function showAuth() {
  authScreen.hidden = false;
  appShell.hidden = true;

  const params = new URLSearchParams(location.search);
  if (params.get("verified")) {
    showAuthMessage("E-Mail bestätigt! Du kannst dich anmelden, sobald ein Admin dich für Projekte freigegeben hat.", "ok");
    history.replaceState(null, "", "/");
  } else if (params.get("verifyerror")) {
    showAuthMessage("Bestätigungslink ungültig oder bereits verwendet.", "error");
    history.replaceState(null, "", "/");
  } else if (params.get("reset")) {
    resetToken = params.get("reset");
    switchAuthTab("reset");
    history.replaceState(null, "", "/");
  }
}

async function init() {
  const res = await fetch("/api/auth/me");

  if (!res.ok) {
    showAuth();
    return;
  }

  currentUser = await res.json();
  authScreen.hidden = true;
  appShell.hidden = false;

  navAdmin.hidden = !isAdmin();
  newProjectBtn.hidden = !isAdmin();
  userBox.hidden = false;
  userNameText.textContent = currentUser.name;
  userRole.textContent = isAdmin() ? "Admin" : "User";

  userRenameBtn.innerHTML = icon("edit", "icon icon-sm");
  userRenameBtn.onclick = async () => {
    const name = prompt("Neuer Name:", currentUser.name);
    if (!name || !name.trim()) return;

    const res = await fetch("/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() })
    });

    if (res.ok) {
      currentUser = { ...currentUser, ...(await res.json()) };
      userNameText.textContent = currentUser.name;
    }
  };

  parseHash();
  render();
  await loadProjects();
}

/* ---------- Daten ---------- */

async function loadProjects() {
  const res = await fetch("/api/projects");
  if (!res.ok) return showAuth();
  currentProjects = await res.json();

  projectList.innerHTML = "";

  if (currentProjects.length === 0) {
    const empty = document.createElement("p");
    empty.className = "project-empty";
    empty.textContent = isAdmin()
      ? "Noch keine Projekte."
      : "Du bist noch für kein Projekt freigegeben.";
    projectList.appendChild(empty);
  }

  for (const project of currentProjects) {
    const btn = document.createElement("button");
    btn.className = "project-btn" + (project.id === currentProjectId ? " is-active" : "");
    btn.onclick = () => selectProject(project);

    const thumb = document.createElement("span");
    thumb.className = "project-thumb";
    if (project.image) {
      const img = document.createElement("img");
      img.src = project.image;
      img.alt = "";
      thumb.appendChild(img);
    } else {
      thumb.textContent = (project.title || "?").trim().charAt(0).toUpperCase();
    }

    const info = document.createElement("span");
    info.className = "project-btn-info";

    const label = document.createElement("span");
    label.className = "project-label";
    label.textContent = project.title;

    const size = document.createElement("span");
    size.className = "project-size";
    size.textContent = `${project.file_count || 0} Datei${(project.file_count || 0) === 1 ? "" : "en"} · ${formatBytes(project.total_size || 0)}`;

    info.appendChild(label);
    info.appendChild(size);

    btn.appendChild(thumb);
    btn.appendChild(info);

    if (isAdmin()) {
      const actions = document.createElement("span");
      actions.className = "project-row-actions";

      const rename = document.createElement("span");
      rename.className = "project-action";
      rename.title = "Projekt umbenennen";
      rename.innerHTML = icon("edit", "icon icon-sm");
      rename.onclick = (e) => {
        e.stopPropagation();
        renameProject(project);
      };

      const del = document.createElement("span");
      del.className = "project-action project-action-danger";
      del.title = "Projekt löschen";
      del.innerHTML = icon("trash", "icon icon-sm");
      del.onclick = (e) => {
        e.stopPropagation();
        deleteProject(project);
      };

      actions.appendChild(rename);
      actions.appendChild(del);
      btn.appendChild(actions);
    }

    projectList.appendChild(btn);
  }

  renderProjectHead();

  if (!currentProjectId && currentProjects[0]) {
    await selectProject(currentProjects[0]);
  }
}

async function renameProject(project) {
  const title = prompt("Neuer Projektname:", project.title);
  if (!title || !title.trim() || title.trim() === project.title) return;

  await fetch(`/api/projects/${project.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: title.trim() })
  });

  await loadProjects();
  render();
}

async function deleteProject(project) {
  const ok = confirm(
    `Projekt "${project.title}" wirklich löschen?\n\nAlle zugehörigen Dateien werden endgültig entfernt.`
  );
  if (!ok) return;

  const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
  if (!res.ok) return;

  if (currentProjectId === project.id) {
    currentProjectId = null;
    currentFiles = [];
  }
  await loadProjects();
  render();
}

async function selectProject(project) {
  currentProjectId = project.id;
  await loadFiles();
  await loadPeople();
  await loadProjects();
  render();
}

async function loadFiles() {
  if (!currentProjectId) {
    currentFiles = [];
    return;
  }
  const res = await fetch(`/api/projects/${currentProjectId}/files`);
  currentFiles = res.ok ? await res.json() : [];
}

async function loadPeople() {
  if (!currentProjectId) {
    currentPeople = [];
    return;
  }
  const res = await fetch(`/api/projects/${currentProjectId}/people`);
  currentPeople = res.ok ? await res.json() : [];
}

function categoryCount(key) {
  return currentFiles.filter((f) => (f.category || "other") === key).length;
}

function showFiles() {
  return currentFiles.filter((f) => f.area === "show");
}

/* ---------- Projektkopf / Projektbild ---------- */

function renderProjectHead() {
  const project = currentProjects.find((p) => p.id === currentProjectId);
  projectTitle.textContent = project ? project.title : "Media Hub";

  if (project) {
    projectStats.innerHTML = icon("database", "icon icon-sm");
    projectStats.append(` ${project.file_count || 0} Datei${(project.file_count || 0) === 1 ? "" : "en"} · ${formatBytes(project.total_size || 0)}`);
  } else {
    projectStats.textContent = "";
  }

  projectRenameBtn.hidden = !(isAdmin() && project);
  projectRenameBtn.innerHTML = icon("edit", "icon icon-sm");
  projectRenameBtn.onclick = async () => {
    if (!project) return;
    const title = prompt("Neuer Projektname:", project.title);
    if (!title || !title.trim()) return;

    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() })
    });

    await loadProjects();
  };

  projectAvatar.innerHTML = "";
  if (project && project.image) {
    const img = document.createElement("img");
    img.src = project.image;
    img.alt = project.title;
    projectAvatar.appendChild(img);
  } else {
    projectAvatar.innerHTML = icon("images", "icon avatar-placeholder");
  }
}

projectAvatar.onclick = () => {
  if (currentProjectId) projectImageInput.click();
};

projectImageInput.onchange = async () => {
  const file = projectImageInput.files[0];
  if (!file || !currentProjectId) return;

  const formData = new FormData();
  formData.append("image", file);

  await fetch(`/api/projects/${currentProjectId}/image`, {
    method: "POST",
    body: formData
  });

  projectImageInput.value = "";
  await loadProjects();
};

/* ---------- Routing ---------- */

function parseHash() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  currentView = parts[0] || "dashboard";
  currentCategory = currentView === "uploads" ? parts[1] || null : null;
}

window.addEventListener("hashchange", () => {
  parseHash();
  render();
});

/* ---------- Rendering ---------- */

function render() {
  if (!currentUser) return;

  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.toggle("is-active", link.dataset.view === currentView);
  });

  viewEl.innerHTML = "";

  if (currentView === "uploads") {
    viewCrumb.textContent = "Uploads";
    renderUploads();
  } else if (currentView === "show") {
    viewCrumb.textContent = "Show";
    renderShow();
  } else if (currentView === "admin") {
    viewCrumb.textContent = "Admin";
    renderAdmin();
  } else if (currentView === "people") {
    viewCrumb.textContent = "People";
    renderPeople();
  } else if (currentView === "player") {
    viewCrumb.textContent = "Player";
    renderPlayer();
  } else if (AREAS.some((a) => a.placeholder && a.key === currentView)) {
    const area = AREAS.find((a) => a.key === currentView);
    viewCrumb.textContent = area.label;
    renderPlaceholder(area);
  } else {
    viewCrumb.textContent = "Dashboard";
    renderDashboard();
  }
}

/* ---------- Dashboard mit Drag & Drop ---------- */

function savedAreaOrder() {
  try {
    const raw = JSON.parse(localStorage.getItem("areaOrder"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function orderedAreas() {
  const order = savedAreaOrder();
  const byKey = new Map(AREAS.map((a) => [a.key, a]));
  const result = [];

  for (const key of order) {
    if (byKey.has(key)) {
      result.push(byKey.get(key));
      byKey.delete(key);
    }
  }
  for (const area of AREAS) {
    if (byKey.has(area.key)) result.push(area);
  }

  return result;
}

function renderDashboard() {
  const grid = document.createElement("div");
  grid.className = "area-grid";

  let draggingCard = null;

  for (const area of orderedAreas()) {
    const card = document.createElement("a");
    card.className = "area-card" + (area.placeholder ? " is-placeholder" : "");
    card.href = "#/" + (area.view || area.key);
    card.dataset.key = area.key;
    card.draggable = true;

    let value = "–";
    let badge = "";
    let desc = area.desc;

    if (area.key === "uploads") {
      value = String(currentFiles.length);
      badge = "aktiv";
      const totalSize = currentFiles.reduce((sum, f) => sum + (f.size || 0), 0);
      desc = `Alle Medien & Dateien · ${formatBytes(totalSize)}`;
    } else if (area.key === "show") {
      value = String(showFiles().length);
      badge = showFiles().length > 0 ? "ready" : "leer";
    } else if (area.key === "people") {
      value = String(currentPeople.length);
      badge = currentPeople.length > 0 ? "aktiv" : "leer";
    } else if (area.key === "player") {
      value = String(showFiles().length);
      badge = showFiles().length > 0 ? "ready" : "leer";
    } else {
      badge = "bald";
    }

    card.innerHTML = `
      <div class="area-card-top">
        <span class="area-title">${icon(area.key, "icon area-icon")}<span class="area-name">${area.label}</span></span>
        <span class="badge ${area.placeholder ? "badge-muted" : "badge-lime"}">${badge}</span>
      </div>
      <div class="area-count">${value}</div>
      <div class="area-desc">${desc}</div>
    `;

    card.addEventListener("dragstart", (e) => {
      draggingCard = card;
      card.classList.add("is-dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", area.key);
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("is-dragging");
      draggingCard = null;
      const order = [...grid.querySelectorAll(".area-card")].map((c) => c.dataset.key);
      localStorage.setItem("areaOrder", JSON.stringify(order));
    });

    grid.appendChild(card);
  }

  grid.addEventListener("dragover", (e) => {
    e.preventDefault();
    const target = e.target.closest(".area-card");
    if (!draggingCard || !target || target === draggingCard) return;

    const rect = target.getBoundingClientRect();
    const before =
      (e.clientY - rect.top) / rect.height < 0.5 ||
      ((e.clientY - rect.top) / rect.height < 0.75 && (e.clientX - rect.left) / rect.width < 0.5);
    grid.insertBefore(draggingCard, before ? target : target.nextSibling);
  });

  grid.addEventListener("drop", (e) => e.preventDefault());

  viewEl.appendChild(grid);
}

/* ---------- Uploads ---------- */

function renderUploads() {
  if (!currentProjectId) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Kein Projekt ausgewählt.";
    viewEl.appendChild(empty);
    return;
  }

  const dropzone = document.createElement("div");
  dropzone.className = "dropzone";
  dropzone.innerHTML = `
    <div>
      ${icon("uploads", "icon dropzone-icon")}
      <strong>Dateien hierher ziehen</strong>
      <span>oder klicken zum Auswählen</span>
    </div>
  `;

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.multiple = true;
  fileInput.hidden = true;
  dropzone.appendChild(fileInput);

  dropzone.onclick = () => fileInput.click();
  fileInput.onchange = () => uploadFiles(fileInput.files);
  dropzone.ondragover = (e) => {
    e.preventDefault();
    dropzone.classList.add("is-dragover");
  };
  dropzone.ondragleave = () => dropzone.classList.remove("is-dragover");
  dropzone.ondrop = (e) => {
    e.preventDefault();
    dropzone.classList.remove("is-dragover");
    uploadFiles(e.dataTransfer.files);
  };

  viewEl.appendChild(dropzone);

  const progress = document.createElement("div");
  progress.className = "upload-progress";
  progress.id = "uploadProgress";
  progress.innerHTML = `
    <div class="upload-progress-track"><div class="upload-progress-bar"></div></div>
    <span class="upload-progress-text"></span>
  `;
  viewEl.appendChild(progress);
  updateUploadProgress();

  const tiles = document.createElement("div");
  tiles.className = "category-grid";

  const makeTile = (key, label, iconName, count) => {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className =
      "category-tile" + (currentCategory === key ? " is-active" : "");
    tile.dataset.cat = key || "all";
    tile.innerHTML = `
      ${icon(iconName, "icon category-icon")}
      <span class="category-label">${label}</span>
      <span class="category-count">${count}</span>
    `;
    tile.onclick = () => selectCategory(key);
    return tile;
  };

  tiles.appendChild(makeTile(null, "Alle", "alle", currentFiles.length));
  for (const cat of CATEGORIES) {
    tiles.appendChild(makeTile(cat.key, cat.label, cat.key, categoryCount(cat.key)));
  }

  viewEl.appendChild(tiles);

  const searchBox = document.createElement("div");
  searchBox.className = "search-box";
  searchBox.innerHTML = icon("search", "icon icon-sm search-icon");

  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.placeholder = "Dateien durchsuchen …";
  searchInput.value = searchQuery;
  searchBox.appendChild(searchInput);

  viewEl.appendChild(searchBox);

  const gridWrap = document.createElement("div");

  const refreshGrid = () => {
    let files = currentCategory
      ? currentFiles.filter((f) => (f.category || "other") === currentCategory)
      : currentFiles;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      files = files.filter((f) => (f.original_name || "").toLowerCase().includes(q));
    }

    gridWrap.innerHTML = "";
    gridWrap.appendChild(
      buildFileGrid(sortFiles(files), searchQuery ? "Keine Dateien gefunden." : "Noch keine Dateien in dieser Kategorie.")
    );
  };

  uploadsRefreshGrid = refreshGrid;

  viewEl.appendChild(buildViewControls(refreshGrid));
  viewEl.appendChild(gridWrap);

  searchInput.oninput = () => {
    searchQuery = searchInput.value.trim();
    refreshGrid();
  };

  refreshGrid();
}

// Kategorie wechseln, ohne die ganze Ansicht neu aufzubauen –
// so springt beim Klick nichts, nur Aktiv-Markierung und Dateiliste ändern sich.
function selectCategory(key) {
  currentCategory = key;
  history.replaceState(null, "", key ? `#/uploads/${key}` : "#/uploads");

  document.querySelectorAll(".category-tile").forEach((tile) => {
    tile.classList.toggle("is-active", tile.dataset.cat === (key || "all"));
  });

  if (uploadsRefreshGrid) uploadsRefreshGrid();
}

function renderShow() {
  const intro = document.createElement("p");
  intro.className = "view-intro";
  intro.textContent = "Dateien, die für die Show übernommen wurden (nur Video, Audio, Bilder).";
  viewEl.appendChild(intro);

  const gridWrap = document.createElement("div");

  const refreshGrid = () => {
    gridWrap.innerHTML = "";
    gridWrap.appendChild(
      buildFileGrid(sortFiles(showFiles()), "Noch nichts übernommen – im Uploads-Bereich „In Show übernehmen“ klicken.")
    );
  };

  viewEl.appendChild(buildViewControls(refreshGrid));
  viewEl.appendChild(gridWrap);
  refreshGrid();
}

/* ---------- Player ---------- */

async function renderPlayer() {
  if (!currentProjectId) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Kein Projekt ausgewählt.";
    viewEl.appendChild(empty);
    return;
  }

  const box = document.createElement("div");
  box.className = "player-view";

  const showCount = showFiles().length;

  box.innerHTML = `
    <div class="player-card">
      <h3>${icon("player", "icon area-icon")} diecrew Player</h3>
      <p>Der Player läuft als eigenes Vollbild-Tool in einem neuen Tab. Er lädt automatisch die
      gespeicherte Playlist dieses Projekts – oder, falls noch keine existiert, alle Dateien aus der Show.</p>
      <div class="player-stats">
        <span class="badge ${showCount > 0 ? "badge-lime" : "badge-muted"}">${showCount} Show-Datei${showCount === 1 ? "" : "en"}</span>
        <span class="badge badge-muted" id="playerPlaylistInfo">Playlist wird geprüft …</span>
      </div>
      <div class="player-actions">
        <a class="btn" href="/player.html?project=${currentProjectId}" target="_blank" rel="noopener">Player öffnen</a>
        <a class="btn-small btn-ghost" href="#/show">Zur Show-Ansicht</a>
      </div>
      <p class="player-hint">Im Player: Reihenfolge per Drag & Drop, Loop/Endverhalten pro Clip –
      „Playlist speichern“ legt alles am Server ab, sodass jedes Gerät dieselbe Playlist lädt.</p>
    </div>
  `;

  viewEl.appendChild(box);

  const info = document.getElementById("playerPlaylistInfo");
  try {
    const res = await fetch(`/api/projects/${currentProjectId}/player-playlist`);
    if (res.ok) {
      const saved = await res.json();
      info.className = "badge badge-lime";
      info.textContent = `Playlist „${saved.name}“ · ${formatDate(saved.updated_at)}${saved.updated_by ? " · " + saved.updated_by : ""}`;
    } else {
      info.textContent = "Noch keine Playlist gespeichert";
    }
  } catch {
    info.textContent = "Playlist-Status nicht abrufbar";
  }
}

/* ---------- People ---------- */

const ROLE_SUGGESTIONS = [
  "Regie", "Produktion", "Kamera", "Ton", "Licht", "Bühne",
  "Cast / Darsteller", "Musik", "Grafik", "Social Media", "Kontakt"
];

function renderPeople() {
  if (!currentProjectId) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Kein Projekt ausgewählt.";
    viewEl.appendChild(empty);
    return;
  }

  const head = document.createElement("div");
  head.className = "people-head";

  const intro = document.createElement("p");
  intro.className = "view-intro";
  intro.textContent = "Beteiligte, Crew und Kontakte für dieses Projekt.";
  head.appendChild(intro);

  const addBtn = document.createElement("button");
  addBtn.className = "btn people-add";
  addBtn.innerHTML = icon("add", "icon icon-sm") + " Person hinzufügen";
  addBtn.onclick = () => openPersonForm(null);
  head.appendChild(addBtn);

  viewEl.appendChild(head);

  if (currentPeople.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Noch keine Personen – oben rechts „Person hinzufügen“.";
    viewEl.appendChild(empty);
    return;
  }

  const grid = document.createElement("div");
  grid.className = "people-grid";

  for (const person of currentPeople) {
    grid.appendChild(buildPersonCard(person));
  }

  viewEl.appendChild(grid);
}

function buildPersonCard(person) {
  const card = document.createElement("div");
  card.className = "person-card";

  const avatar = document.createElement("div");
  avatar.className = "person-avatar";
  if (person.photo) {
    const img = document.createElement("img");
    img.src = person.photo;
    img.alt = person.name;
    avatar.appendChild(img);
  } else {
    avatar.innerHTML = icon("user", "icon person-avatar-icon");
  }
  card.appendChild(avatar);

  const body = document.createElement("div");
  body.className = "person-body";

  const name = document.createElement("div");
  name.className = "person-name";
  name.textContent = person.name;
  body.appendChild(name);

  if (person.role) {
    const role = document.createElement("span");
    role.className = "badge badge-lime person-role";
    role.textContent = person.role;
    body.appendChild(role);
  }

  const contact = document.createElement("div");
  contact.className = "person-contact";

  if (person.email) {
    const a = document.createElement("a");
    a.href = "mailto:" + person.email;
    a.innerHTML = icon("mail", "icon icon-sm");
    a.append(" " + person.email);
    contact.appendChild(a);
  }
  if (person.phone) {
    const a = document.createElement("a");
    a.href = "tel:" + person.phone.replace(/\s+/g, "");
    a.innerHTML = icon("phone", "icon icon-sm");
    a.append(" " + person.phone);
    contact.appendChild(a);
  }
  if (person.email || person.phone) body.appendChild(contact);

  if (person.notes) {
    const notes = document.createElement("p");
    notes.className = "person-notes";
    notes.textContent = person.notes;
    body.appendChild(notes);
  }

  const actions = document.createElement("div");
  actions.className = "person-actions";

  const edit = document.createElement("button");
  edit.className = "btn-small btn-ghost";
  edit.innerHTML = icon("edit", "icon icon-sm") + " Bearbeiten";
  edit.onclick = () => openPersonForm(person);
  actions.appendChild(edit);

  const del = document.createElement("button");
  del.className = "btn-small btn-danger btn-icon";
  del.title = "Person entfernen";
  del.innerHTML = icon("trash", "icon icon-sm");
  del.onclick = () => deletePerson(person);
  actions.appendChild(del);

  body.appendChild(actions);
  card.appendChild(body);

  return card;
}

async function deletePerson(person) {
  if (!confirm(`"${person.name}" wirklich aus dem Projekt entfernen?`)) return;

  const res = await fetch(`/api/people/${person.id}`, { method: "DELETE" });
  if (!res.ok) return;

  await loadPeople();
  await loadProjects();
  render();
}

/* ---------- People-Formular (Modal) ---------- */

const personModal = document.getElementById("personModal");
const personBackdrop = document.getElementById("personBackdrop");
const personClose = document.getElementById("personClose");
const personForm = document.getElementById("personForm");
const personModalTitle = document.getElementById("personModalTitle");
const personPhotoBtn = document.getElementById("personPhotoBtn");
const personPhotoInput = document.getElementById("personPhotoInput");
const personFormError = document.getElementById("personFormError");
const roleSuggestions = document.getElementById("roleSuggestions");

let editingPersonId = null;
let pendingPhotoFile = null;

function closePersonForm() {
  personModal.hidden = true;
  personForm.reset();
  editingPersonId = null;
  pendingPhotoFile = null;
}

personBackdrop.onclick = closePersonForm;
personClose.onclick = closePersonForm;
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !personModal.hidden) closePersonForm();
});

function renderPhotoButton(src) {
  personPhotoBtn.innerHTML = "";
  if (src) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    personPhotoBtn.appendChild(img);
  } else {
    personPhotoBtn.innerHTML = icon("user", "icon person-avatar-icon");
  }
}

personPhotoBtn.onclick = () => personPhotoInput.click();
personPhotoInput.onchange = () => {
  const file = personPhotoInput.files[0];
  if (!file) return;
  pendingPhotoFile = file;
  renderPhotoButton(URL.createObjectURL(file));
};

function openPersonForm(person) {
  editingPersonId = person ? person.id : null;
  pendingPhotoFile = null;
  personFormError.hidden = true;
  personModalTitle.textContent = person ? "Person bearbeiten" : "Person hinzufügen";

  personClose.innerHTML = icon("close", "icon icon-sm");

  roleSuggestions.innerHTML = "";
  for (const role of ROLE_SUGGESTIONS) {
    const opt = document.createElement("option");
    opt.value = role;
    roleSuggestions.appendChild(opt);
  }

  personForm.name.value = person ? person.name || "" : "";
  personForm.role.value = person ? person.role || "" : "";
  personForm.email.value = person ? person.email || "" : "";
  personForm.phone.value = person ? person.phone || "" : "";
  personForm.notes.value = person ? person.notes || "" : "";
  renderPhotoButton(person ? person.photo : null);

  personModal.hidden = false;
  personForm.name.focus();
}

personForm.onsubmit = async (e) => {
  e.preventDefault();
  personFormError.hidden = true;

  const data = {
    name: personForm.name.value.trim(),
    role: personForm.role.value.trim(),
    email: personForm.email.value.trim(),
    phone: personForm.phone.value.trim(),
    notes: personForm.notes.value.trim()
  };

  if (!data.name) {
    personFormError.textContent = "Bitte einen Namen angeben.";
    personFormError.hidden = false;
    return;
  }

  let res;
  if (editingPersonId) {
    res = await fetch(`/api/people/${editingPersonId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
  } else {
    res = await fetch(`/api/projects/${currentProjectId}/people`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    personFormError.textContent = body.error || "Speichern fehlgeschlagen.";
    personFormError.hidden = false;
    return;
  }

  const saved = await res.json();

  if (pendingPhotoFile) {
    const formData = new FormData();
    formData.append("photo", pendingPhotoFile);
    await fetch(`/api/people/${saved.id}/photo`, { method: "POST", body: formData });
  }

  closePersonForm();
  await loadPeople();
  await loadProjects();
  render();
};

function renderPlaceholder(area) {
  const box = document.createElement("div");
  box.className = "placeholder-view";
  box.innerHTML = `
    <h3>${icon(area.key, "icon area-icon")} ${area.label}</h3>
    <p>Dieser Bereich ist vorbereitet und kommt in einem späteren Schritt.</p>
    <a class="btn" href="#/dashboard">Zurück zum Dashboard</a>
  `;
  viewEl.appendChild(box);
}

/* ---------- Admin ---------- */

async function renderAdmin() {
  if (!isAdmin()) {
    const box = document.createElement("p");
    box.className = "empty-state";
    box.textContent = "Kein Zugriff – dieser Bereich ist nur für Admins.";
    viewEl.appendChild(box);
    return;
  }

  const res = await fetch("/api/admin/users");
  if (!res.ok) return;
  const users = await res.json();

  const intro = document.createElement("p");
  intro.className = "view-intro";
  intro.textContent = "Alle registrierten User – bestätigen, für Projekte freigeben oder entfernen.";
  viewEl.appendChild(intro);

  const list = document.createElement("div");
  list.className = "admin-list";

  for (const user of users) {
    const card = document.createElement("div");
    card.className = "admin-card";

    const head = document.createElement("div");
    head.className = "admin-card-head";

    const info = document.createElement("div");
    info.className = "admin-user-info";
    info.innerHTML = `
      <span class="admin-user-name">${user.role === "admin" ? icon("admin", "icon icon-sm admin-badge-icon") : ""}</span>
      <span class="admin-user-mail">${icon("mail", "icon icon-sm")}</span>
      <span class="admin-user-date">${icon("time", "icon icon-sm")} registriert am ${formatDate(user.created_at)}</span>
    `;
    info.querySelector(".admin-user-name").append(user.name);
    info.querySelector(".admin-user-mail").append(" " + user.email);

    const badges = document.createElement("div");
    badges.className = "admin-badges";

    const roleBadge = document.createElement("span");
    roleBadge.className = "badge " + (user.role === "admin" ? "badge-lime" : "badge-muted");
    roleBadge.textContent = user.role === "admin" ? "Admin" : "User";
    badges.appendChild(roleBadge);

    const verifiedBadge = document.createElement("span");
    verifiedBadge.className = "badge " + (user.email_verified ? "badge-lime" : "badge-warn");
    verifiedBadge.textContent = user.email_verified ? "bestätigt" : "unbestätigt";
    badges.appendChild(verifiedBadge);

    head.appendChild(info);
    head.appendChild(badges);
    card.appendChild(head);

    const actions = document.createElement("div");
    actions.className = "admin-actions";

    if (!user.email_verified) {
      const verifyBtn = document.createElement("button");
      verifyBtn.className = "btn-small";
      verifyBtn.innerHTML = icon("check", "icon icon-sm") + " Bestätigen";
      verifyBtn.onclick = async () => {
        await fetch(`/api/admin/users/${user.id}/verify`, { method: "POST" });
        render();
      };
      actions.appendChild(verifyBtn);
    }

    const resetBtn = document.createElement("button");
    resetBtn.className = "btn-small btn-ghost";
    resetBtn.innerHTML = icon("key", "icon icon-sm") + " Reset-Link";
    resetBtn.onclick = async () => {
      const resLink = await fetch(`/api/admin/users/${user.id}/reset-link`, { method: "POST" });
      if (!resLink.ok) return;
      const body = await resLink.json();
      prompt(`Reset-Link für ${user.name} (2 Stunden gültig) – kopieren und weitergeben:`, body.link);
    };
    actions.appendChild(resetBtn);

    if (user.id !== currentUser.id) {
      const delBtn = document.createElement("button");
      delBtn.className = "btn-small btn-danger";
      delBtn.innerHTML = icon("trash", "icon icon-sm") + " Entfernen";
      delBtn.onclick = async () => {
        if (!confirm(`User "${user.name}" (${user.email}) wirklich entfernen?`)) return;
        await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
        render();
      };
      actions.appendChild(delBtn);
    }

    card.appendChild(actions);

    if (user.role !== "admin") {
      const projHeading = document.createElement("div");
      projHeading.className = "admin-proj-heading";
      projHeading.textContent = "Projekt-Freigaben:";
      card.appendChild(projHeading);

      const projGrid = document.createElement("div");
      projGrid.className = "admin-projects";

      if (currentProjects.length === 0) {
        const none = document.createElement("span");
        none.className = "admin-proj-none";
        none.textContent = "Keine Projekte vorhanden.";
        projGrid.appendChild(none);
      }

      for (const project of currentProjects) {
        const label = document.createElement("label");
        label.className = "admin-proj-check";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = user.projects.includes(project.id);
        cb.onchange = async () => {
          await fetch(`/api/admin/users/${user.id}/access`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId: project.id, allowed: cb.checked })
          });
        };

        const span = document.createElement("span");
        span.textContent = project.title;

        label.appendChild(cb);
        label.appendChild(span);
        projGrid.appendChild(label);
      }

      card.appendChild(projGrid);
    }

    list.appendChild(card);
  }

  viewEl.appendChild(list);
}

/* ---------- Datei-Cards ---------- */

const SORT_OPTIONS = [
  { key: "date_desc", label: "Neueste zuerst" },
  { key: "date_asc", label: "Älteste zuerst" },
  { key: "name_asc", label: "Name A–Z" },
  { key: "name_desc", label: "Name Z–A" },
  { key: "size_desc", label: "Größte zuerst" },
  { key: "size_asc", label: "Kleinste zuerst" }
];

function sortFiles(files) {
  const arr = [...files];
  const byName = (a, b) =>
    (a.original_name || "").localeCompare(b.original_name || "", "de", { sensitivity: "base" });
  const byDate = (a, b) => (a.created_at || "").localeCompare(b.created_at || "");
  const bySize = (a, b) => (a.size || 0) - (b.size || 0);

  switch (sortMode) {
    case "date_asc": arr.sort(byDate); break;
    case "name_asc": arr.sort(byName); break;
    case "name_desc": arr.sort((a, b) => byName(b, a)); break;
    case "size_desc": arr.sort((a, b) => bySize(b, a)); break;
    case "size_asc": arr.sort(bySize); break;
    default: arr.sort((a, b) => byDate(b, a));
  }

  return arr;
}

function buildViewControls(onChange) {
  const bar = document.createElement("div");
  bar.className = "view-controls";

  const sliderWrap = document.createElement("div");
  sliderWrap.className = "view-slider";
  sliderWrap.innerHTML = icon("list", "icon icon-sm view-slider-icon");

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "3";
  slider.step = "1";
  slider.value = String(viewScale);
  slider.title = "Ansicht: Liste bis große Kacheln";
  slider.oninput = () => {
    viewScale = Number(slider.value);
    localStorage.setItem("fileViewScale", String(viewScale));
    onChange();
  };
  sliderWrap.appendChild(slider);

  const gridIcon = document.createElement("span");
  gridIcon.innerHTML = icon("grid", "icon icon-sm view-slider-icon");
  sliderWrap.appendChild(gridIcon);

  const select = document.createElement("select");
  select.className = "sort-select";
  select.title = "Sortierung";
  for (const opt of SORT_OPTIONS) {
    const option = document.createElement("option");
    option.value = opt.key;
    option.textContent = opt.label;
    option.selected = opt.key === sortMode;
    select.appendChild(option);
  }
  select.onchange = () => {
    sortMode = select.value;
    localStorage.setItem("fileSort", sortMode);
    onChange();
  };

  bar.appendChild(sliderWrap);
  bar.appendChild(select);
  return bar;
}

function buildFileGrid(files, emptyText) {
  const grid = document.createElement("div");
  grid.className = "file-grid " + (viewScale === 0 ? "is-list" : `tile-${viewScale}`);

  if (files.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = emptyText;
    return empty;
  }

  for (const file of files) {
    grid.appendChild(buildFileCard(file));
  }

  return grid;
}

function buildFileCard(file) {
  const card = document.createElement("div");
  card.className = "file-card";

  card.appendChild(createPreview(file));

  const body = document.createElement("div");
  body.className = "file-body";

  const name = document.createElement("div");
  name.className = "file-name";
  name.title = file.original_name;

  const nameText = document.createElement("span");
  nameText.textContent = file.original_name;
  name.appendChild(nameText);

  const renameBtn = document.createElement("button");
  renameBtn.className = "btn-icon-ghost file-rename";
  renameBtn.title = "Umbenennen";
  renameBtn.innerHTML = icon("edit", "icon icon-sm");
  renameBtn.onclick = () => renameFile(file);
  name.appendChild(renameBtn);

  const meta = document.createElement("div");
  meta.className = "file-meta";
  const cat = CATEGORIES.find((c) => c.key === (file.category || "other"));
  meta.textContent = `${cat ? cat.label : "Other"} · ${formatBytes(file.size)}`;

  const date = document.createElement("div");
  date.className = "file-meta file-date";
  date.innerHTML = icon("time", "icon icon-sm");
  date.append(" " + formatDate(file.created_at));
  if (file.uploaded_by) {
    date.title = "Hochgeladen von " + file.uploaded_by;
  }

  const footer = document.createElement("div");
  footer.className = "file-footer";

  const badge = document.createElement("span");
  const inShow = file.area === "show";
  badge.className = "badge " + (inShow ? "badge-lime" : "badge-muted");
  badge.textContent = inShow ? "ready" : file.status || "new";
  footer.appendChild(badge);

  const btnGroup = document.createElement("div");
  btnGroup.className = "file-actions";

  const category = file.category || "other";
  if (SHOW_CATEGORIES.includes(category)) {
    const action = document.createElement("button");
    action.className = "btn-small btn-show";
    if (inShow) {
      action.textContent = "Aus Show entfernen";
      action.classList.add("btn-remove");
      action.onclick = () => toggleShow(file.id, action, "remove-from-show");
    } else {
      action.textContent = "In Show übernehmen";
      action.onclick = () => toggleShow(file.id, action, "move-to-show");
    }
    btnGroup.appendChild(action);
  }

  const download = document.createElement("a");
  download.className = "btn-small btn-ghost btn-icon";
  download.title = "Herunterladen";
  download.href = `/api/files/${file.id}/download`;
  download.innerHTML = icon("exports", "icon icon-sm");
  btnGroup.appendChild(download);

  if (isAdmin()) {
    const del = document.createElement("button");
    del.className = "btn-small btn-danger btn-icon";
    del.title = "Datei löschen";
    del.innerHTML = icon("trash", "icon icon-sm");
    del.onclick = () => deleteFile(file);
    btnGroup.appendChild(del);
  }

  footer.appendChild(btnGroup);

  body.appendChild(name);
  body.appendChild(meta);
  body.appendChild(date);
  body.appendChild(footer);
  card.appendChild(body);

  return card;
}

async function renameFile(file) {
  const name = prompt("Neuer Dateiname:", file.original_name);
  if (!name || !name.trim() || name.trim() === file.original_name) return;

  const res = await fetch(`/api/files/${file.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.trim() })
  });

  if (!res.ok) return;

  await loadFiles();
  render();
}

async function deleteFile(file) {
  if (!confirm(`Datei "${file.original_name}" endgültig löschen?`)) return;

  const res = await fetch(`/api/files/${file.id}`, { method: "DELETE" });
  if (!res.ok) return;

  await loadFiles();
  render();
}

/* ---------- Große Vorschau (Modal) ---------- */

const previewModal = document.getElementById("previewModal");
const pmBackdrop = document.getElementById("pmBackdrop");
const pmName = document.getElementById("pmName");
const pmMeta = document.getElementById("pmMeta");
const pmDownload = document.getElementById("pmDownload");
const pmClose = document.getElementById("pmClose");
const pmBody = document.getElementById("pmBody");

const TEXT_PREVIEW_EXTENSIONS = ["txt", "csv", "log", "md", "json", "srt", "vtt", "xml"];

function closePreviewModal() {
  previewModal.hidden = true;
  pmBody.innerHTML = "";
}

pmBackdrop.onclick = closePreviewModal;
pmClose.onclick = closePreviewModal;
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !previewModal.hidden) closePreviewModal();
});

async function openPreviewModal(file) {
  const cat = CATEGORIES.find((c) => c.key === (file.category || "other"));
  pmName.textContent = file.original_name;
  pmMeta.textContent = `${cat ? cat.label : "Other"} · ${formatBytes(file.size)} · ${formatDate(file.created_at)}`;
  pmDownload.href = `/api/files/${file.id}/download`;
  pmDownload.innerHTML = icon("exports", "icon icon-sm") + " Download";
  pmClose.innerHTML = icon("close", "icon icon-sm");
  pmBody.innerHTML = "";
  previewModal.hidden = false;

  const ext = (file.original_name || "").toLowerCase().split(".").pop();
  const mime = file.mime_type || "";

  if (mime.startsWith("image/")) {
    const img = document.createElement("img");
    img.src = file.path;
    img.alt = file.original_name;
    pmBody.appendChild(img);
  } else if (mime.startsWith("video/")) {
    const video = document.createElement("video");
    video.src = file.path;
    video.controls = true;
    video.autoplay = false;
    pmBody.appendChild(video);
  } else if (mime.startsWith("audio/")) {
    const audio = document.createElement("audio");
    audio.src = file.path;
    audio.controls = true;
    pmBody.appendChild(audio);
  } else if (mime === "application/pdf" || ext === "pdf" || ext === "ai") {
    const obj = document.createElement("object");
    obj.type = "application/pdf";
    obj.data = file.path;
    obj.className = "pm-pdf";
    pmBody.appendChild(obj);
  } else if (ext === "html" || ext === "htm") {
    const frame = document.createElement("iframe");
    frame.src = file.path;
    frame.className = "pm-frame";
    frame.setAttribute("sandbox", "allow-scripts");
    pmBody.appendChild(frame);
  } else if (mime.startsWith("text/") || TEXT_PREVIEW_EXTENSIONS.includes(ext)) {
    const pre = document.createElement("pre");
    pre.className = "pm-text";
    pre.textContent = "Lade Inhalt …";
    pmBody.appendChild(pre);

    try {
      const res = await fetch(file.path);
      const text = await res.text();
      pre.textContent = text.length > 200000 ? text.slice(0, 200000) + "\n\n… (gekürzt)" : text;
    } catch {
      pre.textContent = "Inhalt konnte nicht geladen werden.";
    }
  } else {
    const fallback = document.createElement("div");
    fallback.className = "pm-fallback";
    fallback.innerHTML = `
      ${icon(file.category || "other", "icon pm-fallback-icon")}
      <p>Für diesen Dateityp gibt es keine Vorschau.</p>
    `;
    pmBody.appendChild(fallback);
  }
}

function createPreview(file) {
  const wrap = document.createElement("div");
  wrap.className = "preview";
  wrap.title = "Große Vorschau öffnen";
  wrap.onclick = () => openPreviewModal(file);

  const ext = (file.original_name || "").toLowerCase().split(".").pop();
  const isPdfLike = file.mime_type === "application/pdf" || ext === "pdf" || ext === "ai";

  if (file.mime_type && file.mime_type.startsWith("image/")) {
    const img = document.createElement("img");
    img.src = file.path;
    img.loading = "lazy";
    img.alt = file.original_name;
    wrap.appendChild(img);
  } else if (file.mime_type && file.mime_type.startsWith("video/")) {
    const video = document.createElement("video");
    video.src = file.path;
    video.controls = true;
    video.preload = "metadata";
    video.onclick = (e) => e.stopPropagation();
    wrap.appendChild(video);
  } else if (file.mime_type && file.mime_type.startsWith("audio/")) {
    const audio = document.createElement("audio");
    audio.src = file.path;
    audio.controls = true;
    audio.onclick = (e) => e.stopPropagation();
    wrap.appendChild(audio);
  } else if (isPdfLike) {
    const obj = document.createElement("object");
    obj.type = "application/pdf";
    obj.data = file.path + "#toolbar=0&navpanes=0";
    obj.className = "pdf-preview";
    obj.innerHTML = icon(file.category || "text", "icon file-icon");
    wrap.appendChild(obj);
  } else {
    wrap.innerHTML = icon(file.category || "other", "icon file-icon");
  }

  return wrap;
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "–";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

function formatDate(sqliteDate) {
  if (!sqliteDate) return "–";
  const date = new Date(sqliteDate.replace(" ", "T") + "Z");
  if (isNaN(date)) return sqliteDate;
  return date.toLocaleString("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/* ---------- Aktionen ---------- */

function updateUploadProgress() {
  const box = document.getElementById("uploadProgress");
  if (!box) return;

  if (!uploadState) {
    box.classList.remove("is-active");
    return;
  }

  box.classList.add("is-active");
  box.querySelector(".upload-progress-bar").style.width = uploadState.percent + "%";

  const pending = uploadQueue.length;
  let text =
    uploadState.percent >= 100
      ? "Wird verarbeitet …"
      : `Lade ${uploadState.count} Datei${uploadState.count === 1 ? "" : "en"} hoch … ${uploadState.percent}%`;
  if (pending > 0) {
    text += ` · ${pending} in Warteschlange`;
  }
  box.querySelector(".upload-progress-text").textContent = text;
}

// Neue Dateien werden gesammelt und der Reihe nach hochgeladen –
// auch wenn während eines laufenden Uploads weitere hinzukommen.
function uploadFiles(files) {
  if (!currentProjectId || !files || files.length === 0) return;

  for (const file of files) {
    uploadQueue.push(file);
  }

  if (uploadState) {
    updateUploadProgress();
  } else {
    uploadErrors = 0;
    processUploadQueue();
  }
}

function processUploadQueue() {
  if (uploadQueue.length === 0) {
    uploadState = null;
    updateUploadProgress();
    loadFiles().then(() => {
      render();
      if (uploadErrors > 0) {
        alert(
          `${uploadErrors} Datei${uploadErrors === 1 ? " konnte" : "en konnten"} nicht hochgeladen werden. Bitte erneut versuchen.`
        );
        uploadErrors = 0;
      }
    });
    return;
  }

  const batch = uploadQueue;
  uploadQueue = [];

  const formData = new FormData();
  for (const file of batch) {
    formData.append("files", file);
  }

  uploadState = { percent: 0, count: batch.length };
  updateUploadProgress();

  const xhr = new XMLHttpRequest();
  xhr.open("POST", `/api/projects/${currentProjectId}/upload`);

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable && uploadState) {
      uploadState.percent = Math.round((e.loaded / e.total) * 100);
      updateUploadProgress();
    }
  };

  xhr.onload = () => {
    if (xhr.status >= 400) uploadErrors += batch.length;
    processUploadQueue();
  };

  xhr.onerror = () => {
    uploadErrors += batch.length;
    processUploadQueue();
  };

  xhr.send(formData);
}

async function toggleShow(fileId, button, action) {
  button.disabled = true;
  button.textContent = "…";

  const res = await fetch(`/api/files/${fileId}/${action}`, { method: "POST" });

  if (!res.ok) {
    button.disabled = false;
    button.textContent = action === "move-to-show" ? "In Show übernehmen" : "Aus Show entfernen";
    return;
  }

  await loadFiles();
  render();
}

newProjectBtn.onclick = async () => {
  const title = prompt("Projektname?");
  if (!title) return;

  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title })
  });

  const project = await res.json();
  await selectProject(project);
};

/* ---------- Start ---------- */

initPwToggles();
init();
