<p align="center">
  <img src="frontend/assets/images/logo.png" alt="PAID LIFT Logo" width="280"/>
</p>

# PAID LIFT INDIA PVT LTD 🚗
> **Quick Book Your Safest Journey** — Modern peer-to-peer carpooling & ride-sharing platform with Aadhaar-verified drivers, live tracking, and transparent pricing.

---

## 🚀 Quick Start (Development)

Run both backend and frontend web concurrently:
```bash
./run.sh
```
- **Frontend Web:** [http://localhost:8081](http://localhost:8081)
- **Backend API Docs:** [http://localhost:8001/docs](http://localhost:8001/docs)

---

## 📱 Building the Android APK

### Method 1: Cloud Build via EAS (Recommended — 0% PC CPU/RAM)
Builds on Expo Application Services (EAS) cloud servers and provides a direct `.apk` download link & QR code:

```bash
cd frontend
npx eas-cli build -p android --profile preview
```

View previous builds or get download links:
```bash
cd frontend
npx eas-cli build:list
```

### Method 2: Local Offline Build (Direct on PC)
Compile natively on your local machine using Android SDK and Gradle:

```bash
# 1. Generate native Android project files (if not already generated)
cd frontend
npx expo prebuild --platform android --no-install

# 2. Build the APK via Gradle
cd android
./gradlew assembleRelease
```
- **Generated APK Location:**
  `frontend/android/app/build/outputs/apk/release/app-release.apk`

---

## 🌐 Live Production Backend

- **API Base URL:** [https://paidlift.onrender.com](https://paidlift.onrender.com)
- **Swagger API Docs:** [https://paidlift.onrender.com/docs](https://paidlift.onrender.com/docs)
- **Health & DB Check:** [https://paidlift.onrender.com/health](https://paidlift.onrender.com/health)

---

## 🔑 Demo & Test Credentials

| Field | Value |
| :--- | :--- |
| **Login Phone Number** | Any 10-digit number (e.g., `9876543210`) |
| **Login OTP** | `123456` |
| **Aadhaar KYC Number** | Any 12-digit number (e.g., `123412341234`) |
| **Aadhaar OTP** | `123456` |
| **Admin Secret Key** | `paidlift_superadmin_secret_2026` |
