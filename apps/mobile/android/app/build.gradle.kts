plugins {
    id("com.android.application")
    id("dev.flutter.flutter-gradle-plugin")
}

val releaseStorePath = System.getenv("SUQNAA_ANDROID_KEYSTORE_PATH")
val releaseStorePassword = System.getenv("SUQNAA_ANDROID_KEYSTORE_PASSWORD")
val releaseKeyAlias = System.getenv("SUQNAA_ANDROID_KEY_ALIAS")
val releaseKeyPassword = System.getenv("SUQNAA_ANDROID_KEY_PASSWORD")
val releaseSigningConfigured = listOf(
    releaseStorePath,
    releaseStorePassword,
    releaseKeyAlias,
    releaseKeyPassword
).all { !it.isNullOrBlank() }
val signingTaskRequested = gradle.startParameter.taskNames.any {
    it.contains("Release", ignoreCase = true) || it.contains("Staging", ignoreCase = true)
}

if (signingTaskRequested && !releaseSigningConfigured) {
    throw GradleException("Release signing credentials must be supplied outside the repository")
}

android {
    namespace = "co.privacyx.suqnaa"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "co.privacyx.suqnaa"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            if (releaseSigningConfigured) {
                storeFile = file(releaseStorePath!!)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
                enableV1Signing = false
                enableV2Signing = true
                enableV3Signing = true
                enableV4Signing = true
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        create("staging") {
            initWith(getByName("release"))
            applicationIdSuffix = ".staging"
            versionNameSuffix = "-staging"
            matchingFallbacks += listOf("release")
            signingConfig = signingConfigs.getByName("release")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
