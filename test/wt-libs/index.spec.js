import { assert } from 'chai';
import sinon from 'sinon';
import WTLibs from '../../src/index';
import DataModel from '../../src/data-model';

describe('WTLibs', () => {
  describe('createInstance', () => {
    let createDataModelSpy;

    beforeEach(() => {
      createDataModelSpy = sinon.spy(DataModel, 'createInstance');
    });

    afterEach(() => {
      createDataModelSpy.restore();
    });

    it('should initialize data model', () => {
      const libs = WTLibs.createInstance();
      assert.isDefined(libs.dataModel);
      assert.equal(createDataModelSpy.callCount, 1);
    });

    it('should pass data model options', () => {
      const libs = WTLibs.createInstance({
        dataModelOptions: {
          random: '1234',
        },
      });
      assert.isDefined(libs.dataModel);
      assert.equal(createDataModelSpy.firstCall.args[0].random, '1234');
    });
  });
});
