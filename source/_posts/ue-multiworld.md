---
title: UE5单进程多GameInstance方案
tags:
  - UE
id: ue-multiworld
categories:
  - 笔记
date: 2025-10-15 12:10:30
---

# 如何开启多实例

使用`-NumMultiWorld=num`来开启指定数量(num)的GameInstance实例

# 修改思路

为了降低和官方引擎的差异，通过引入新的`UMultiWorldGameEngine`继承自`UGameEngine`重写必要的方法，来实现单进程多实例的方案。

参照PIE复制World的方案，将同一份资源加载出多个UPackage，每一个UPackage对应一个World。在对象的命名上参考PIE模式，增加前缀UEMW\_\$id\$\_以作区分。

```Shell
[2025.06.17-16.31.25:853][  0]LogGlobalStatus: UEngine::LoadMap Load map complete /Game/Project/Maps/MyMap/UEMW_1_MyMap
```

# 实现细节

### 引擎部分

* `UEngine::LoadMap()`时增加`MW_URLTrueMapName`选项参数来指定真正的地图资源，比如上面log中的`/Game/Project/Maps/MyMap/MyMap`。原有的URL.Map通过增加`UEMW_$id$_`前缀来实现同一份资源加载出不同的WorldPackage。

UnrealEngine.cpp
![code1](https://github.com/zhangga/picx-images-hosting/raw/master/ue-multiworld-1.8ok36kfpzv.webp)
World.cpp
![code2](https://github.com/zhangga/picx-images-hosting/raw/master/ue-multiworld-2.8s3p4aamxp.webp)

* 对 *streaming levels ​*进行重命名（这里趟过坑）。参考PIE对World的完整处理流程`UEngine::CreatePIEWorldByLoadingFromPackage()`

UnrealEngine.cpp
![code3](https://github.com/zhangga/picx-images-hosting/raw/master/ue-multiworld-3.5j4l7qadwz.webp)

```C++
// This method refers to the above CreatePIEWorldByLoadingFromPackage().
	void RenameForMultiWorld(UWorld* InWorld, const FString& SourceWorldPackage, const FString& InMWPrefix)
	{
		check(InWorld);
		
		// Rename streaming levels to MultiWorld. refers to StreamingLevel::RenameForPIE
		for (ULevelStreaming* StreamingLevel : InWorld->GetStreamingLevels())
		{
			// Apply the MultiWorld prefix so this level references
			if (!StreamingLevel->GetWorldAsset().IsNull())
			{
				FName NonPrefixedName = FName(StripMWPrefixFromPackageName(StreamingLevel->GetWorldAssetPackageName(), InMWPrefix));
				
				// Store original name
				if (StreamingLevel->PackageNameToLoad == NAME_None)
				{
					StreamingLevel->PackageNameToLoad = NonPrefixedName;
				}
				FName CurrWorldStreamingPackageName = FName(ConvertToMWPackageName(StreamingLevel->GetWorldAssetPackageName(), InMWPrefix));
				FSoftObjectPath::AddPIEPackageName(CurrWorldStreamingPackageName);
				StreamingLevel->SetWorldAssetByPackageName(CurrWorldStreamingPackageName);
			}
			
			// Rename LOD levels if any
			if (StreamingLevel->LODPackageNames.Num() > 0)
			{
				StreamingLevel->LODPackageNamesToLoad.Reset(StreamingLevel->LODPackageNames.Num());
				for (FName& LODPackageName : StreamingLevel->LODPackageNames)
				{
					// Store LOD level original package name
					StreamingLevel->LODPackageNamesToLoad.Add(LODPackageName);
					// Apply MultiWorld prefix to package name
					const FName NonPrefixedLODPackageName = LODPackageName;
					LODPackageName = FName(ConvertToMWPackageName(LODPackageName.ToString(), InMWPrefix));
					FSoftObjectPath::AddPIEPackageName(LODPackageName);
				}
			}
		}
	}
```

### 项目部分

主要部分

UMultiWorldGameEngine.cpp

```C++
#if USE_MWGAMEENGINE
void UMultiWorldGameEngine::Init(class IEngineLoop* InEngineLoop)
{
    Super::Init(InEngineLoop);

    // Preload and hold assets for DS.
    // 按需实现下提前加载资源，注意，加载完资源后要用强引用持有，别被GC。
    UPreloadSubsystem Preload = GEngine->GetEngineSubsystem<UPreloadSubsystem>();
    check(Preload);
    Preload->PreloadAssets();

    if (!FParse::Value(FCommandLine::Get(), TEXT("-NumMultiWorld="), NumMultiWorld))
    {
       NumMultiWorld = 1;
    }
    // Single game instance.
​    ​if (NumMultiWorld <= 1)
    {
       // The base GameEngine->GameInstance is the only one.
       ensure(MultiGameInstances.Num() == 0);
       MultiGameInstances.Add(GameInstance);
       return;
    }

    // 多实例模式下，基础的 GameEngine->GameInstance 不存放在 TArray<MultiGameInstances> 容器中。
    // 并且基础GameInstance不要被分配出去使用（被分配出去使用就可能会被销毁释放），要始终保留。 如果它被释放了，所有其他实例共用的它的UWorlds也被释放了。
​    ​// Try to create ${NumMultiWorld} game instances.
​    ​for (uint16 i = 0; i < NumMultiWorld; ++i)
    {
       uint16 InstanceID = i;
       ensure(MultiGameInstances.Num() == InstanceID);
       FSoftClassPath GameInstanceClassName = GetDefault<UGameMapsSettings>()->GameInstanceClass;
       UClass* GameInstanceClass = (GameInstanceClassName.IsValid() ? LoadObject<UClass>(NULL, *GameInstanceClassName.ToString()) : UGameInstance::StaticClass());

       if (GameInstanceClass == nullptr)
       {
          UE_LOG(LogEngine, Error, TEXT("UMultiWorldGameEngine: Unable to load GameInstance Class '%s'. Falling back to generic UGameInstance."), *GameInstanceClassName.ToString());
          GameInstanceClass = UGameInstance::StaticClass();
       }

       UGameInstance* OtherGameInstance = NewObject<UGameInstance>(this, GameInstanceClass);
       MultiGameInstances.Add(OtherGameInstance);
       OtherGameInstance->InitializeStandalone();
       UE_LOG(LogEngine, Display, TEXT("UMultiWorldGameEngine: GameInstance %d Initialized."), InstanceID);
    }
}

void UMultiWorldGameEngine::Start()
{
    Super::Start();

    // Single game instance.
​    ​if (NumMultiWorld <= 1)
    {
       return;
    }

    // MultiWorld mode
​    ​for (int32 i = 0; i < MultiGameInstances.Num(); ++i)
    {
       MultiGameInstances[i]->StartGameInstance();
    }
}

bool UMultiWorldGameEngine::LoadMap(FWorldContext& WorldContext, FURL URL, class UPendingNetGame* Pending, FString& Error)
{
    // Single game instance.
​    ​if (NumMultiWorld <= 1)
    {
       // normal UE behavior
​       ​return Super::LoadMap(WorldContext, URL, Pending, Error);
    }

    // MultiWorld mode
​    ​uint16 MWInstanceID = GetMWIDByGameInstance(WorldContext.OwningGameInstance);
    if (MWInstanceID == INSTANCE_ID_NONE)
    {
       // set the base GameEngine->GameInstance port=1, ​dont​ start network.
​       ​URL.Port = 1;
       // normal UE behavior
​       ​return Super::LoadMap(WorldContext, URL, Pending, Error);
    }

    // Note: The base GameEngine->GameInstance Package Prefix is UEMW_0_ , thus the first created instance is UEMW_1_ .
    uint16 MWPackagePrefixID = MWInstanceID + 1;

    // Try to strip prefix from MWPackageName
​    ​URL.Map = StripPrefixFromMWPackageName(URL.Map);

    // process URL before Browse
​    ​FString MultiWorldPrefix = BuildMWPackagePrefix(MWPackagePrefixID);
    FString MWPrefixOp = TEXT("MW_Prefix=") + MultiWorldPrefix;
    URL.AddOption(*MWPrefixOp);
    FString MultiWorldMapName = ConvertToMWPackageName(URL.Map, MWPackagePrefixID);
    FString URLTrueMapNameOp = TEXT("MW_URLTrueMapName=") + URL.Map;
    URL.Map = MultiWorldMapName;
    URL.AddOption(*URLTrueMapNameOp);
    if (URL.Port == FURL::UrlConfig.DefaultPort)
    {
       URL.Port += MWInstanceID;
    }

    return Super::LoadMap(WorldContext, URL, Pending, Error);
}

bool UMultiWorldGameEngine::NetworkRemapPath(UNetConnection* Connection, FString& Str, bool bReading /*= true*/)
{
        Str = StripPrefixFromMWPackageName(Str);
        return true;
}
#endif
```

### 修改配置

1. MyProjectServer.Target.cs

```Shell
// use MWGameEngine
GlobalDefinitions.Add("USE_MWGAMEENGINE=1");
```

2. DefaultEngine.ini

```Shell
[/Script/Engine.Engine]
GameEngine=/Script/MyProject.MultiWorldGameEngine
```

3. 启动参数

```Shell
-NumMultiWorld=$num
```

### 注意细节

1. 原来GameInstance退出的时候就退出Engine，现在需要判断所有GameInstance退出后才能退出Engine。
2. 原来游戏中是单例的数据结构，现在需要视情况跟着GameInstance走。

# 适用场景

在 CPU 资源占用较低的地图场景中，可通过单进程多开 GameInstance 的方式，直接复用进程内已加载的资源内存（如地图配置、静态模型）。相比共享内存（Fork）模式，该方案能进一步优化 CPU 与内存的资源配比，最终在承载相同数量场景实例的前提下，显著降低整体内存占用。
