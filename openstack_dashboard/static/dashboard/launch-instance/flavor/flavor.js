/*
 *    (c) Copyright 2015 Hewlett-Packard Development Company, L.P.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
(function () {
  'use strict';

  var module = angular.module('hz.dashboard.launch-instance');

  module.controller('LaunchInstanceFlavorCtrl', [
    '$scope',
    'launchInstanceModel',
    LaunchInstanceFlavorCtrl
  ]);

  module.controller('LaunchInstanceFlavorHelpCtrl', [
    '$scope',
    LaunchInstanceFlavorHelpCtrl
  ]);

  function LaunchInstanceFlavorCtrl($scope, launchInstanceModel) {

    // Labels for the flavor step
    this.title = gettext('Flavor');
    this.subtitle = gettext("Flavors manage the sizing for the compute, memory and storage capacity of the instance.");

    // Labels used by quota charts
    this.chartTotalInstancesLabel = gettext('Total Instances');
    this.chartTotalVcpusLabel = gettext('Total VCPUs');
    this.chartTotalRamLabel = gettext('Total RAM');

    // Flavor "facades" are used instead of just flavors because per-flavor
    // data needs to be associated with each flavor to support the quota chart
    // in the flavor details. A facade simply wraps an underlying data object,
    // exposing only the data needed by this specific view.
    this.availableFlavorFacades = [];
    this.displayedAvailableFlavorFacades = [];
    this.allocatedFlavorFacades = [];
    this.displayedAllocatedFlavorFacades = [];

    // Convenience references to launch instance model elements
    this.flavors = [];
    this.novaLimits = {};
    this.instanceCount = 1;

    // Data that drives the transfer table for flavors
    this.transferTableModel = {
      allocated:          this.allocatedFlavorFacades,
      displayedAllocated: this.displayedAllocatedFlavorFacades,
      available:          this.availableFlavorFacades,
      displayedAvailable: this.displayedAvailableFlavorFacades
    };

    // Each flavor has an instances chart...but it is the same for all flavors
    this.instancesChartData = {};

    // We can pick at most, 1 flavor at a time
    this.allocationLimits = {
      maxAllocation: 1
    };

    // Flavor facades and the new instance chart depend on nova limit data
    $scope.$watch(function (scope) {
      return launchInstanceModel.novaLimits;
    }, function (newValue, oldValue, scope) {
      var ctrl = scope.selectFlavorCtrl;
      ctrl.novaLimits = newValue;
      ctrl.updateFlavorFacades();
    }, true);

    // Flavor facades depend on flavors
    $scope.$watchCollection("model.flavors",
      function (newValue, oldValue, scope) {
        var ctrl = scope.selectFlavorCtrl;
        ctrl.flavors = newValue;
        ctrl.updateFlavorFacades();
      }
    );

    // Flavor quota charts depend on the current instance count
    $scope.$watch(function () {
      return launchInstanceModel.newInstanceSpec.instance_count;
    }, function (newValue, oldValue, scope) {
      var ctrl = scope.selectFlavorCtrl;
      // Ignore any values <1
      ctrl.instanceCount = Math.max(1, newValue);
      ctrl.updateFlavorFacades();
    });

    // Update the new instance model when the allocated flavor changes
    $scope.$watchCollection("selectFlavorCtrl.allocatedFlavorFacades",
      function (newValue, oldValue, scope) {
        if (newValue && newValue.length > 0) {
          launchInstanceModel.newInstanceSpec.flavor = newValue[0].flavor;
        } else {
          delete launchInstanceModel.newInstanceSpec.flavor;
        }
      }
    );

    // Convenience function to return a sensible value instead of
    // undefined
    this.defaultIfUndefined = function (value, defaultValue) {
      return (value === undefined) ? defaultValue : value;
    };

    /*
     * Given flavor data, build facades that expose the specific attributes
     * needed by this view. These facades will be updated to include per-flavor
     * data, such as charts, as that per-flavor data is modified.
     */
    this.buildFlavorFacades = function () {
      var facade;
      var flavor;
      for (var i = 0; i < this.flavors.length; i++) {
        flavor = this.flavors[i];
        facade = {
          flavor:        flavor,
          id:            flavor.id,
          name:          flavor.name,
          vcpus:         flavor.vcpus,
          ram:           flavor.ram,
          totalDisk:     flavor.disk + flavor['OS-FLV-EXT-DATA:ephemeral'],
          rootDisk:      flavor.disk,
          ephemeralDisk: flavor['OS-FLV-EXT-DATA:ephemeral'],
          isPublic:      flavor['os-flavor-access:is_public'],
        };
        this.availableFlavorFacades.push(facade);
      }
    };

    /*
     * Some change in the underlying data requires we update our facades
     * primarily the per-flavor chart data.
     */
    this.updateFlavorFacades = function () {
      if (this.availableFlavorFacades.length !== this.flavors.length) {
        // Build the facades to match the flavors
        this.buildFlavorFacades();
      }

      // The instance chart is the same for all flavors, create it once
      var instancesChartData = this.getChartData(
        this.chartTotalInstancesLabel,
        this.instanceCount,
        launchInstanceModel.novaLimits.totalInstancesUsed,
        launchInstanceModel.novaLimits.maxTotalInstances);

      // Each flavor has a different cpu and ram chart, create them here and
      // add that data to the flavor facade
      for (var i = 0; i < this.availableFlavorFacades.length; i++) {
        var facade = this.availableFlavorFacades[i];

        facade.instancesChartData = instancesChartData;

        facade.vcpusChartData = this.getChartData(
          this.chartTotalVcpusLabel,
          this.instanceCount * facade.vcpus,
          launchInstanceModel.novaLimits.totalCoresUsed,
          launchInstanceModel.novaLimits.maxTotalCores);

        facade.ramChartData = this.getChartData(
          this.chartTotalRamLabel,
          this.instanceCount * facade.ram,
          launchInstanceModel.novaLimits.totalRAMUsed,
          launchInstanceModel.novaLimits.maxTotalRAMSize);
      }
    };

    this.getChartData = function (title, added, totalUsed, maxAllowed) {

      var used = this.defaultIfUndefined(totalUsed, 0);
      var allowed = this.defaultIfUndefined(maxAllowed, 1);

      var usageData = {
        label: gettext('Current Usage'),
        value: used,
        color: '#1f83c6'
      };
      var addedData = {
        label: gettext('Added'),
        value: added,
        color: '#81c1e7'
      };
      var remainingData = {
        label: gettext('Remaining'),
        value: Math.max(0, allowed - used - added),
        color: '#d1d3d4'
      };
      var chartData = {
        title: title,
        label: Math.ceil((used + added) / allowed * 100) + '%',
        data:  [usageData, addedData, remainingData]
      };

      return chartData;
    };
  }

  function LaunchInstanceFlavorHelpCtrl($scope) {
    var ctrl = this;

    ctrl.title = gettext('Flavor Help');

    ctrl.paragraphs = [
      gettext('The flavor you select for an instance determines the amount of compute, storage and memory resources that will be carved out for the instance.'),
      gettext('The flavor you select must have enough resources allocated to support the type of instance you are trying to create. Flavors that don\'t provide enough resources for your instance are identified on the <b>Available</b> table with a yellow warning icon.'),
      gettext('Administrators are responsible for creating and managing flavors. A custom flavor can be created for you or for a specific project where it is shared with the users assigned to that project. If you need a custom flavor, contact your administrator.')
    ];
  }

})();
