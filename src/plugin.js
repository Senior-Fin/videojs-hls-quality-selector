import videojs from 'video.js';
import {version as VERSION} from '../package.json';
import ConcreteButton from './ConcreteButton';
import ConcreteMenuItem from './ConcreteMenuItem';

// Default options for the plugin.
const defaults = {};

// Cross-compatibility for Video.js 5 and 6.
const registerPlugin = videojs.registerPlugin || videojs.plugin;

/**
 * VideoJS HLS Quality Selector Plugin class.
 */
class HlsQualitySelectorPlugin {

  /**
   * Plugin Constructor.
   *
   * @param {Player} player - The videojs player instance.
   * @param {Object} options - The plugin options.
   */
  constructor(player, options) {
    this.player = player;
    this.config = options;
    this.bandwidthToNameMap = null;

    // If there is quality levels plugin and the HLS tech exists
    // then continue.
    if (this.player.qualityLevels && this.getTechStreaming()) {
      // Create the quality button.
      this.createQualityButton();
      this.bindPlayerEvents();
    }
  }

  /**
   * Returns HLS or VHS Plugin
   *
   * @return {*} - <videojs-hls-contrib | videojs/http-streaming> plugin.
   */
  getTechStreaming() {
    const tech = this.player.tech({IWillNotUseThisInPlugins: true});

    return tech.vhs || tech.hls;
  }

  /**
   * Returns master playlist of Tech Streaming Tool
   * @returns {*[]}
   */
  getMasterPlaylists() {
    const { playlists } = this.getTechStreaming();

    if (playlists && typeof playlists.master === 'object') {
      const { master } = playlists;

      return master.playlists || [];
    }

    return playlists || [];
  }

  /**
   * Maps master playlist attributes bandwidth to name
   */
  getBandwidthToNameMap() {
    if (!this.bandwidthToNameMap) {
      const playlists = this.getMasterPlaylists();

      this.bandwidthToNameMap = playlists.reduce((acc, playlist) => {
        if (typeof playlist === 'object' && typeof playlist.attributes === 'object') {
          const { NAME, BANDWIDTH } = playlist.attributes;
          return Object.assign(acc, { [BANDWIDTH]: NAME });
        }

        return acc;
      }, {});
    }


    return this.bandwidthToNameMap;
  }

  /**
   * Binds listener for quality level changes.
   */
  bindPlayerEvents() {
    this.player.qualityLevels().on('addqualitylevel', this.onAddQualityLevel.bind(this));
  }

  /**
   * Adds the quality menu button to the player control bar.
   */
  createQualityButton() {

    const player = this.player;

    this._qualityButton = new ConcreteButton(player);

    const placementIndex = player.controlBar.children().length - 2;
    const concreteButtonInstance = player.controlBar.addChild(this._qualityButton,
      {componentClass: 'qualitySelector'},
      this.config.placementIndex || placementIndex);

    concreteButtonInstance.addClass('vjs-quality-selector');
    if (!this.config.displayCurrentQuality) {
      const icon = ` ${this.config.vjsIconClass || 'vjs-icon-hd'}`;

      concreteButtonInstance
        .menuButton_.$('.vjs-icon-placeholder').className += icon;
    } else {
      this.setButtonInnerText('auto');
    }
    concreteButtonInstance.removeClass('vjs-hidden');

  }

  /**
   *Set inner button text.
   *
   * @param {string} text - the text to display in the button.
   */
  setButtonInnerText(text) {
    this._qualityButton
      .menuButton_.$('.vjs-icon-placeholder').innerHTML = text;
  }

  /**
   * Builds individual quality menu items.
   *
   * @param {Object} item - Individual quality menu item.
   * @return {ConcreteMenuItem} - Menu item
   */
  getQualityMenuItem(item) {
    const player = this.player;

    return new ConcreteMenuItem(player, item, this._qualityButton, this);
  }

  /**
   *
   * @param item - Individual quality menu item.
   * @returns {{label: *, value: number}|null} - Quality label and value (metadata).
   */
  getQualityMeta(item) {
    if (typeof item === 'object' && (!item.width || !item.height)) {
      const bandwidth = this.getBandwidthToNameMap();
      const key = item.bandwidth ? item.bandwidth.toString() : undefined;

      console.log({ key, bandwidth });

      return {
        label: bandwidth[key],
        value: item.bandwidth,
      }
    }

    const { height, width } = item;
    const pixels = width > height ? height : width;

    return {
      label: pixels + 'p',
      value: item.bandwidth,
    };
  }

  getLevelItems(levels) {
    const items = {};

    for (let i = 0; i < levels.length; ++i) {
      const {value, label} = this.getQualityMeta(levels[i]);

      if (!items[value]) {
        items[value] = this.getQualityMenuItem.call(this, {
          label,
          value
        });
      }
    }

    return Object.keys(items).map(key => items[key]);
  }

  /**
   * Executed when a quality level is added from HLS playlist.
   */
  onAddQualityLevel() {
    const player = this.player;
    const qualityList = player.qualityLevels();
    const levels = qualityList.levels_ || [];
    const levelItems = this.getLevelItems(levels);

    levelItems.sort((current, next) => {
      if ((typeof current !== 'object') || (typeof next !== 'object')) {
        return -1;
      }
      if (current.item.value < next.item.value) {
        return -1;
      }
      if (current.item.value > next.item.value) {
        return 1;
      }
      return 0;
    });

    levelItems.push(this.getQualityMenuItem.call(this, {
      label: player.localize('Auto'),
      value: 'auto',
      selected: true
    }));

    if (this._qualityButton) {
      this._qualityButton.createItems = function () {
        return levelItems;
      };
      this._qualityButton.update();
    }

  }

  /**
   * Sets quality (based on media short side)
   *
   * @param {number} quality - A number representing HLS playlist.
   */
  setQuality(quality) {
    const qualityList = this.player.qualityLevels();

    console.log({ quality, qualityList });

    // Set quality on plugin
    this._currentQuality = quality;

    if (this.config.displayCurrentQuality) {
      this.setButtonInnerText(quality === 'auto' ? quality : `${quality}p`);
    }

    for (let i = 0; i < qualityList.length; ++i) {
      const {width, height} = qualityList[i];
      const pixels = width > height ? height : width;

      qualityList[i].enabled = (pixels === quality || quality === 'auto');
    }
    this._qualityButton.unpressButton();
  }

  /**
   * Return the current set quality or 'auto'
   *
   * @return {string} the currently set quality
   */
  getCurrentQuality() {
    return this._currentQuality || 'auto';
  }

}

/**
 * Function to invoke when the player is ready.
 *
 * This is a great place for your plugin to initialize itself. When this
 * function is called, the player will have its DOM and child components
 * in place.
 *
 * @function onPlayerReady
 * @param    {Player} player
 *           A Video.js player object.
 *
 * @param    {Object} [options={}]
 *           A plain object containing options for the plugin.
 */
const onPlayerReady = (player, options) => {
  player.addClass('vjs-hls-quality-selector');
  player.hlsQualitySelector = new HlsQualitySelectorPlugin(player, options);
};

/**
 * A video.js plugin.
 *
 * In the plugin function, the value of `this` is a video.js `Player`
 * instance. You cannot rely on the player being in a "ready" state here,
 * depending on how the plugin is invoked. This may or may not be important
 * to you; if not, remove the wait for "ready"!
 *
 * @function hlsQualitySelector
 * @param    {Object} [options={}]
 *           An object of options left to the plugin author to define.
 */
const hlsQualitySelector = function (options) {
  this.ready(() => {
    onPlayerReady(this, videojs.mergeOptions(defaults, options));
  });
};

// Register the plugin with video.js.
registerPlugin('hlsQualitySelector', hlsQualitySelector);

// Include the version number.
hlsQualitySelector.VERSION = VERSION;

export default hlsQualitySelector;
