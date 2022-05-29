angular
.module('beamng.apps')
.controller('AppCtrl', function ($scope, $mdSidenav) {
  // ---- 定数 ----
  // コンフィグパス
  const SETTINGS_PATH = '/settings/ui_apps/thrill_drive.json';

  // 言語設定
  const DEFAULT_LANG = 'en';
  const SUPPORT_LANGS = ['en', 'ja'];
  let currentLanguage = DEFAULT_LANG;

  // クラッシュカメラの設定
  const CRASH_THRESHOLD = 10000;
  const CRASH_CAMERA_DURATION_DEFAULT = 6;
  let currentTotalDamage = 0;

  // 画面に表示する変数の初期化
  $scope.totalDamage = 0;
  $scope.totalDamageTitle = '';
  $scope.crashMessage = '';
  $scope.currentDamageString = '';
  $scope.crashCamera = {
    title: '',
    enabled: true,
    duration: CRASH_CAMERA_DURATION_DEFAULT,
    durationTitle: ''
  };
  $scope.language = '';

  // settings/Closeボタン押下時に実行される関数
  $scope.toggleLeft = buildToggler('left');

  // リセットボタン押下時に実行される関数
  $scope.resetTotalDamage = function() {currentTotalDamage = 0};

  // Lua APIのロード
  console.log('API loaded');
  bngApi.engineLua('extensions.loadAtRoot("lua/thrillDrive/main", "thrillDrive")');

  // コンフィグ読み込み
  bngApi.engineLua('jsonReadFile(' + bngApi.serializeToLua(SETTINGS_PATH) + ')', (settings) => {
    if (settings != null) {
      // 画面にデフォルト値として設定
      $scope.language = (SUPPORT_LANGS.includes(settings.lang)) ? settings.lang : DEFAULT_LANG;
      $scope.crashCamera.enabled = settings.crashCamera ? true : false;
      $scope.crashCamera.duration = Number.isNaN(Number(settings.crashCameraDuration)) ? CRASH_CAMERA_DURATION_DEFAULT : Number(settings.crashCameraDuration);
      currentTotalDamage = Number.isNaN(Number(settings.result.totalDamage)) ? 0 : Number(settings.result.totalDamage);
      console.log(SETTINGS_PATH + "is loaded.");
    }
  });

  // フレーム毎のループ
  $scope.$on('streamsUpdate', function (event, data) {
    // 画面更新
    $scope.$evalAsync(function() {
      currentLanguage = $scope.language;
    });
    // 指定言語に合わせて表示に変更
    let locale = getLocale(currentLanguage);
    $scope.totalDamageTitle = locale.totalDamageTitle;
    $scope.crashCamera.title = locale.crashCameraTitle;
    $scope.crashCamera.durationTitle = locale.crashCameraDurationTitle;

    // 被害総額取得。計算はLua内で実施するように変更
    bngApi.engineLua('thrillDrive_main.getCurrentDamageByValue()', (damage) => {
      currentTotalDamage += damage;
    });

    if ($scope.crashCamera.enabled) {
      enableCrashCamera();
    }

    $scope.$evalAsync(function() {
      $scope.totalDamage = locale.damageToLocalString(currentTotalDamage);
    });
  });

  // 終了時の処理
  $scope.$on('$destroy', function () {
    // コンフィグファイルに保存
    let config = {lang:currentLanguage, crashCamera:$scope.crashCamera.enabled, crashCameraDuration:$scope.crashCamera.duration, result:{totalDamage:currentTotalDamage}};
    bngApi.engineLua('jsonWriteFile(' + bngApi.serializeToLua(SETTINGS_PATH) + ', ' + bngApi.serializeToLua(config) + ', ' + bngApi.serializeToLua(true) + ')');
  });

  // サイドメニューの開閉
  function buildToggler(componentId) {
    return function() {
      $mdSidenav(componentId).toggle();
    }
  }

  // クラッシュカメラの処理
  function enableCrashCamera() {
    bngApi.engineLua('thrillDrive_main.getPlayerDamageDelta()', (_playerDamageDelta) => {
      // プレイヤー車両の1回のダメージ値が閾値を超えるとクラッシュカメラ起動

      if (_playerDamageDelta > CRASH_THRESHOLD) {
        // クラッシュ時に表示する文字を更新
        let locale = getLocale(currentLanguage);
        $scope.crashMessage = locale.crashMessage;
        $scope.currentDamageString = locale.totalDamageTitle + '  ' + locale.damageToLocalString(currentTotalDamage);

        // クラッシュカメラ有効化
        bngApi.engineLua('thrillDrive_main.enableCrashCamera()');

        // 一定時間でクラッシュカメラ無効化
        // 実行順の制御はUI側に持たせたいのでタイムアウト処理は画面側で行う
        console.log($scope.crashCamera.duration);
        setTimeout(
          function() {
            bngApi.engineLua('thrillDrive_main.disableCrashCamera()');
            $scope.crashMessage = '';
            $scope.currentDamageString = '';
          }, ($scope.crashCamera.duration * 1000)
        );
      }
    });
  }

  // ---- UI上に表示する言語の設定 ----
  function getLocale(localeName){
    if (localeName == 'ja') {
      return new JaLocale();
    } else {
      return new EnLocale();
    }
  };

  class LocalInfoBase {
    extraCSS = '';
    totalDamageTitle = 'Total Damage';
    crashCameraTitle = 'Crash Camera';
    crashCameraDurationTitle = 'Duration [sec]';

    crashMessage = 'CRASHED! ACCIDENT!!';

    damageToLocalString(damage) {
      return '$' + damage.toLocaleString(undefined, { maximumFractionDigits: 0 });
    }
  };

  class EnLocale extends LocalInfoBase {};

  class JaLocale extends LocalInfoBase {
    settings = '設定';
    totalDamageTitle = '被害総額';
    crashCameraTitle = 'クラッシュカメラ';
    crashCameraDurationTitle = '継続時間 [秒]';
    crashMessage = '重大事故発生 重大事故発生';

    // 京の桁まで対応
    maxDisplayDigits = 10000 * 10000 * 10000 * 10000 * 10000;

    damageToLocalString(damage) {
      let _damage = damage * 120;

      if (_damage > this.maxDisplayDigits) {
        return '￥' + (damage * 120).toLocaleString(undefined, { maximumFractionDigits: 0 });
      } else {
        let _str = String(Math.round(_damage));
        let keta = ['', '万', '億', '兆', '京'];
        let nums = _str.replace(/(\d)(?=(\d\d\d\d)+$)/g, "$1,").split(",").reverse();
        let data = '';
        for (let i = 0; i < nums.length; i++) {
          if ((nums.length - i) > 2) {
            continue;
          }

          if (!nums[i].match(/^[0]+$/)) {
            data = nums[i].replace(/^[0]+/g, "") + keta[i] + data;
          }
        }
        if (data == '') {
          data = '0';
        }
        return data + '円';
      }
    }
  };

})
.directive('thrillDrive', [function () {
  return {
    templateUrl: '/ui/modules/apps/thrillDrive/app.html',
    replace: true,
    restrict: 'EA',
    link: function (scope, element, attrs) {
      'use strict';
    }
  };
}])
